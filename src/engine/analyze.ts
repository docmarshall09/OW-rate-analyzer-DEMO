import type {
  IngestResult,
  AnalysisParams,
  AnalysisResult,
  EmergencePoint,
  RollupRow,
  ProcessedContract,
  ProcessedClaim,
} from './types'

// ── Emergence curve ───────────────────────────────────────────────────────────

export function buildEmergence(
  triangles: IngestResult['triangles'],
  params: AnalysisParams
): EmergencePoint[] {
  const { credibilityThreshold, tailDecay } = params

  // Per-quarter: sum credible PYs
  const credExposure: number[] = new Array(20).fill(0)
  const credLoss: number[] = new Array(20).fill(0)

  for (let q = 0; q < 20; q++) {
    for (let py = 0; py < 4; py++) {
      if (triangles.exposure[py][q] >= credibilityThreshold) {
        credExposure[q] += triangles.exposure[py][q]
        credLoss[q] += triangles.loss[py][q]
      }
    }
  }

  const observedPP: number[] = credExposure.map((e, q) =>
    e > 0 ? credLoss[q] / e : 0
  )

  // Last credible quarter (1-based)
  let lastCredibleQ = 0
  for (let q = 0; q < 20; q++) {
    if (observedPP[q] > 0) lastCredibleQ = q + 1
  }

  // Final PP with tail projection
  const finalPP: number[] = new Array(20).fill(0)
  for (let q = 0; q < 20; q++) {
    if (q + 1 <= lastCredibleQ) {
      finalPP[q] = observedPP[q]
    } else {
      finalPP[q] = (q === 0 ? 0 : finalPP[q - 1]) * tailDecay
    }
  }

  // Quarterly contribution = finalPP × 0.25
  const quarterlyContrib = finalPP.map((pp) => pp * 0.25)
  const ultimatePP = quarterlyContrib.reduce((s, v) => s + v, 0)

  const points: EmergencePoint[] = []
  let cumEnd = 0
  for (let q = 0; q < 20; q++) {
    const emergencePct = ultimatePP > 0 ? quarterlyContrib[q] / ultimatePP : 0
    const cumStart = cumEnd
    cumEnd += emergencePct
    points.push({
      q: q + 1,
      credExposure: credExposure[q],
      credLoss: credLoss[q],
      observedPP: observedPP[q],
      finalPP: finalPP[q],
      quarterlyContribution: quarterlyContrib[q],
      emergencePct,
      cumStart,
      cumEnd,
      isProjected: q + 1 > lastCredibleQ,
    })
  }

  return points
}

// ── Earned premium for one contract ──────────────────────────────────────────

function earnedPremiumForContract(
  c: ProcessedContract,
  emergence: EmergencePoint[],
  onLevel: boolean,
  currentRate: number
): number {
  if (c.excludedContract || c.monthsElapsed === 0) return 0

  const currentDevQtr = Math.max(1, Math.min(20, Math.ceil(c.monthsElapsed / 3)))
  const monthsIntoQtr = c.monthsElapsed - 3 * (currentDevQtr - 1)

  const ep = emergence[currentDevQtr - 1]
  const earnedFraction =
    ep.cumStart + (monthsIntoQtr / 3) * ep.emergencePct

  const basePremium = onLevel ? currentRate : c.writtenPremium
  return basePremium * earnedFraction
}

// ── Build one rollup row ──────────────────────────────────────────────────────

function buildRollup(
  label: string,
  contracts: ProcessedContract[],
  claims: ProcessedClaim[],
  emergence: EmergencePoint[],
  ultimatePP: number,
  params: AnalysisParams
): RollupRow {
  const { onLevel, currentRate, targetLR } = params

  const inScope = contracts.filter((c) => !c.excludedContract)
  const goodClaims = claims.filter((c) => c.goodClaim)

  const writtenPrem = inScope.reduce((s, c) => s + c.writtenPremium, 0)
  const earnedPrem = inScope.reduce(
    (s, c) => s + earnedPremiumForContract(c, emergence, onLevel, currentRate),
    0
  )
  const paidLosses = goodClaims.reduce((s, c) => s + c.cost, 0)
  const exposureYears = inScope.reduce((s, c) => s + c.monthsElapsed / 12, 0)

  const avgPremium = onLevel ? currentRate : writtenPrem / (inScope.length || 1)

  const asOfLR = earnedPrem > 0 ? paidLosses / earnedPrem : 0
  const ultimateLR = avgPremium > 0 ? ultimatePP / avgPremium : 0

  const method1 = targetLR > 0 ? asOfLR / targetLR - 1 : 0
  const method2 = avgPremium > 0 && targetLR > 0 ? ultimatePP / targetLR / avgPremium - 1 : 0

  const frequency = exposureYears > 0 ? goodClaims.length / exposureYears : 0
  const severity = goodClaims.length > 0 ? paidLosses / goodClaims.length : 0

  return {
    label,
    contracts: inScope.length,
    writtenPrem,
    earnedPrem,
    paidLosses,
    goodClaims: goodClaims.length,
    exposureYears,
    avgPremium,
    ultimatePP,
    asOfLR,
    ultimateLR,
    method1,
    method2,
    frequencyAnnual: frequency,
    severity,
  }
}

// ── Main analyze function (pure, synchronous) ─────────────────────────────────

export function analyze(
  ingestResult: IngestResult,
  params: AnalysisParams
): AnalysisResult {
  const { triangles, contracts, claims } = ingestResult

  const emergence = buildEmergence(triangles, params)
  const ultimatePP = emergence.reduce((s, e) => s + e.quarterlyContribution, 0)
  const lastCredibleQ = emergence.filter((e) => !e.isProjected).length

  // Total row (current params)
  const total = buildRollup('Total', contracts, claims, emergence, ultimatePP, params)

  // By PY (1-4)
  const byPY: RollupRow[] = [1, 2, 3, 4].map((py) => {
    const pyContracts = contracts.filter((c) => c.salePY === py)
    const pyClaims = claims.filter((c) => c.salePY === py)
    return buildRollup(`PY${py}`, pyContracts, pyClaims, emergence, ultimatePP, params)
  })

  // By SKU
  const bySKU: RollupRow[] = (['SKU1', 'SKU2'] as const).map((sku) => {
    const skuContracts = contracts.filter((c) => c.sku === sku)
    const skuClaims = claims.filter((c) => c.sku === sku)
    return buildRollup(sku, skuContracts, skuClaims, emergence, ultimatePP, params)
  })

  // On-level total (params with onLevel forced on)
  const onLevelParams = { ...params, onLevel: true }
  const totalOnLevel = buildRollup('Total (on-level)', contracts, claims, emergence, ultimatePP, onLevelParams)

  // Both-method × both-toggle
  const asIncurredParams = { ...params, onLevel: false }
  const asIncurredRollup = buildRollup('', contracts, claims, emergence, ultimatePP, asIncurredParams)
  const onLevelRollup = buildRollup('', contracts, claims, emergence, ultimatePP, { ...params, onLevel: true })

  return {
    params,
    emergence,
    ultimatePP,
    lastCredibleQ,
    total,
    byPY,
    bySKU,
    totalOnLevel,
    method1AsIncurred: asIncurredRollup.method1,
    method2AsIncurred: asIncurredRollup.method2,
    method1OnLevel: onLevelRollup.method1,
    method2OnLevel: onLevelRollup.method2,
  }
}
