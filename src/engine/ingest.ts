import * as XLSX from 'xlsx'
import type {
  RawContract,
  RawClaim,
  ProcessedContract,
  ProcessedClaim,
  ExclusionReason,
  ClaimExclusionReason,
  Triangles,
  IngestResult,
  IngestSummary,
} from './types'

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Parse Excel serial date, ISO string, or Date object → Date | null */
export function parseDate(val: unknown): Date | null {
  if (val == null || val === '') return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (typeof val === 'number') {
    // Excel serial: days since 1899-12-30 (accounting for Lotus 1-2-3 leap-year bug)
    const d = new Date(Math.round((val - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'string') {
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function parseNum(val: unknown): number | null {
  if (val == null || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}

function diffDays(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24)
}

function diffMonths(end: Date, start: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.5)
}

// ── Policy-year banding ───────────────────────────────────────────────────────

/**
 * Detect anchor: floor of min-sale-date to the nearest Feb 1 on or before it.
 * Falls back to 2021-02-01 if no sales found.
 */
export function detectAnchor(saleDates: (Date | null)[]): Date {
  const valid = saleDates.filter((d): d is Date => d != null)
  if (valid.length === 0) return new Date('2021-02-01')
  const minTs = valid.reduce((m, d) => Math.min(m, d.getTime()), Infinity)
  const min = new Date(minTs)
  // Use UTC throughout to avoid local-timezone boundary issues with Excel serial dates
  const year = min.getUTCFullYear()
  let anchor = new Date(Date.UTC(year, 1, 1)) // Feb 1 of that year, UTC
  if (anchor > min) anchor = new Date(Date.UTC(year - 1, 1, 1))
  return anchor
}

function getSalePY(saleDate: Date | null, anchor: Date): number {
  if (!saleDate) return 0
  const t = saleDate.getTime()
  const a = anchor.getTime()
  const yr = 365.25 * 24 * 60 * 60 * 1000
  if (t < a) return 0
  const idx = Math.floor((t - a) / yr)
  return Math.min(idx + 1, 5) // 1-4 within window; 5 = overflow
}

// ── Contract processing ───────────────────────────────────────────────────────

function processContracts(
  raw: RawContract[],
  evalDate: Date,
  anchor: Date
): ProcessedContract[] {
  return raw.map((r) => {
    const sku = (r.WrittenPremium ?? 0) < 80 ? 'SKU1' : ('SKU2' as const)
    const salePY = getSalePY(r.ContractSaleDate, anchor)

    // Exclusion logic — priority order, first match labels the reason
    let exclusionReason: ExclusionReason | null = null

    const mfwBad = r.OEMWarrantyTerm !== 12
    const durationBad = r.ContractDuration !== 5
    const dateGap =
      r.ContractEffectiveDate != null && r.ContractSaleDate != null
        ? Math.abs(diffDays(r.ContractEffectiveDate, r.ContractSaleDate)) > 90
        : false
    const saleAfterEval =
      r.ContractSaleDate != null && r.ContractSaleDate > evalDate
    const badPremium =
      r.WrittenPremium == null || r.WrittenPremium <= 0
    const cancelBeforeEff =
      r.ContractCancellationDate != null &&
      r.ContractEffectiveDate != null &&
      r.ContractCancellationDate < r.ContractEffectiveDate

    if (mfwBad) exclusionReason = 'MFW != 12'
    else if (durationBad) exclusionReason = 'Duration != 5'
    else if (dateGap) exclusionReason = 'Date misalignment'
    else if (saleAfterEval) exclusionReason = 'Sale after eval'
    else if (badPremium) exclusionReason = 'Bad premium'
    else if (cancelBeforeEff) exclusionReason = 'Cancel before effective'

    const excludedContract = exclusionReason !== null

    // ExposureEnd
    const candidates: number[] = []
    if (r.ContractCancellationDate) candidates.push(r.ContractCancellationDate.getTime())
    if (r.ContractExpirationDate) candidates.push(r.ContractExpirationDate.getTime())
    candidates.push(evalDate.getTime())
    const exposureEnd = new Date(Math.min(...candidates))

    // MonthsElapsed
    let monthsElapsed = 0
    if (!excludedContract && r.ContractEffectiveDate) {
      const raw = diffMonths(exposureEnd, r.ContractEffectiveDate)
      monthsElapsed = Math.max(0, Math.min(raw, 60))
    }

    // Quarterly exposure-years Q1..Q20
    const quarterlyExposure: number[] = []
    for (let k = 1; k <= 20; k++) {
      const qk = Math.max(0, Math.min(monthsElapsed, 3 * k) - 3 * (k - 1)) / 12
      quarterlyExposure.push(qk)
    }

    return {
      contractId: String(r.ContractID),
      salePY,
      sku,
      writtenPremium: r.WrittenPremium ?? 0,
      effectiveDate: r.ContractEffectiveDate,
      expirationDate: r.ContractExpirationDate,
      cancellationDate: r.ContractCancellationDate,
      saleDate: r.ContractSaleDate,
      excludedContract,
      exclusionReason,
      flagMFW: mfwBad,
      flagDuration: durationBad,
      flagDateMisalign: dateGap,
      flagSaleAfterEval: saleAfterEval,
      flagBadPremium: badPremium,
      flagCancelBeforeEff: cancelBeforeEff,
      monthsElapsed,
      quarterlyExposure,
    }
  })
}

// ── Claim processing ──────────────────────────────────────────────────────────

function processClaims(
  raw: RawClaim[],
  contractMap: Map<string, ProcessedContract>,
  evalDate: Date
): ProcessedClaim[] {
  return raw.map((r) => {
    const parent = contractMap.get(String(r.Contract_ID))
    const cost = r.Total_Claim_Cost_in_USD ?? 0

    let exclusionReason: ClaimExclusionReason | null = null

    const contractExcluded = !parent || parent.excludedContract
    const denied = r.Resolution_Type === 'DENIED'
    const zeroCost = r.Total_Claim_Cost_in_USD == null || r.Total_Claim_Cost_in_USD <= 0
    const missingDate = r.Transaction_Date == null
    const transAfterEval = r.Transaction_Date != null && r.Transaction_Date > evalDate
    const transBeforeEff =
      r.Transaction_Date != null &&
      parent?.effectiveDate != null &&
      r.Transaction_Date < parent.effectiveDate
    const transAfterExp =
      r.Transaction_Date != null &&
      parent?.expirationDate != null &&
      r.Transaction_Date > parent.expirationDate
    const transAfterCancel =
      r.Transaction_Date != null &&
      parent?.cancellationDate != null &&
      r.Transaction_Date > parent.cancellationDate

    if (contractExcluded) exclusionReason = 'Contract excluded'
    else if (denied) exclusionReason = 'Denied'
    else if (zeroCost) exclusionReason = 'Zero or negative cost'
    else if (missingDate) exclusionReason = 'Missing Transaction_Date'
    else if (transAfterEval) exclusionReason = 'Trans after eval'
    else if (transBeforeEff) exclusionReason = 'Trans before effective'
    else if (transAfterExp) exclusionReason = 'Trans after expiration'
    else if (transAfterCancel) exclusionReason = 'Trans after cancellation'

    const goodClaim = exclusionReason === null

    // DevQtr
    let devQtr: number | null = null
    if (goodClaim && r.Transaction_Date && parent?.effectiveDate) {
      const monthsSince = diffMonths(r.Transaction_Date, parent.effectiveDate)
      if (monthsSince != null) {
        devQtr = Math.max(1, Math.min(20, Math.ceil(monthsSince / 3)))
      }
    }

    return {
      claimId: String(r.Claim_ID),
      contractId: String(r.Contract_ID),
      salePY: parent?.salePY ?? 0,
      sku: parent?.sku ?? 'SKU1',
      cost,
      devQtr,
      goodClaim,
      exclusionReason,
    }
  })
}

// ── Build triangles ───────────────────────────────────────────────────────────

function buildTriangles(
  contracts: ProcessedContract[],
  claims: ProcessedClaim[]
): Triangles {
  const empty = (): number[][] =>
    Array.from({ length: 4 }, () => new Array(20).fill(0))

  const exposure = empty()
  const count = empty()
  const loss = empty()

  for (const c of contracts) {
    const pyIdx = c.salePY - 1
    if (pyIdx < 0 || pyIdx > 3) continue
    for (let q = 0; q < 20; q++) {
      exposure[pyIdx][q] += c.quarterlyExposure[q]
    }
  }

  for (const cl of claims) {
    if (!cl.goodClaim || cl.devQtr == null) continue
    const pyIdx = cl.salePY - 1
    if (pyIdx < 0 || pyIdx > 3) continue
    const qIdx = cl.devQtr - 1
    count[pyIdx][qIdx] += 1
    loss[pyIdx][qIdx] += cl.cost
  }

  return { exposure, count, loss }
}

// ── Detect current rate ───────────────────────────────────────────────────────

function detectCurrentRate(contracts: ProcessedContract[]): number {
  // Find contracts in the latest sale month; take modal premium
  const sorted = contracts
    .filter((c) => !c.excludedContract && c.saleDate != null)
    .sort((a, b) => b.saleDate!.getTime() - a.saleDate!.getTime())

  if (sorted.length === 0) return 82.25

  const latestMonth = sorted[0].saleDate!.getFullYear() * 12 + sorted[0].saleDate!.getMonth()
  const latestCohort = sorted.filter((c) => {
    const m = c.saleDate!.getFullYear() * 12 + c.saleDate!.getMonth()
    return m === latestMonth
  })

  // Modal premium among latest cohort
  const freq = new Map<number, number>()
  for (const c of latestCohort) {
    const p = Math.round(c.writtenPremium * 100) / 100
    freq.set(p, (freq.get(p) ?? 0) + 1)
  }
  let modal = 82.25
  let maxCount = 0
  for (const [p, cnt] of freq) {
    if (cnt > maxCount) { maxCount = cnt; modal = p }
  }
  return modal
}

// ── Parse raw rows from XLSX sheet ───────────────────────────────────────────

function sheetToObjects(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null })
}

function parseContractRows(rows: Record<string, unknown>[]): RawContract[] {
  return rows.map((r) => ({
    ContractID: String(r['ContractID'] ?? r['Contract ID'] ?? ''),
    ContractSaleDate: parseDate(r['ContractSaleDate'] ?? r['Contract Sale Date']),
    ContractEffectiveDate: parseDate(r['ContractEffectiveDate'] ?? r['Contract Effective Date']),
    ContractExpirationDate: parseDate(r['ContractExpirationDate'] ?? r['Contract Expiration Date']),
    ContractDuration: parseNum(r['ContractDuration'] ?? r['Contract Duration']),
    ContractCancellationDate: parseDate(r['ContractCancellationDate'] ?? r['Contract Cancellation Date']),
    WrittenPremium: parseNum(r['WrittenPremium'] ?? r['Written Premium']),
    RefundPremium: parseNum(r['RefundPremium'] ?? r['Refund Premium']),
    ProductType: String(r['ProductType'] ?? r['Product Type'] ?? ''),
    OEMWarrantyTerm: (() => {
      const v = r['OEMWarrantyTerm'] ?? r['OEM Warranty Term']
      if (v == null || v === '') return null
      const n = Number(v)
      return isNaN(n) ? null : n
    })(),
  }))
}

function parseClaimRows(rows: Record<string, unknown>[]): RawClaim[] {
  return rows.map((r) => ({
    Contract_ID: String(r['Contract_ID'] ?? r['ContractID'] ?? ''),
    Transaction_Date: parseDate(r['Transaction_Date'] ?? r['TransactionDate']),
    Claim_ID: String(r['Claim_ID'] ?? r['ClaimID'] ?? ''),
    Total_Claim_Cost_in_USD: parseNum(r['Total_Claim_Cost_in_USD'] ?? r['TotalClaimCost']),
    Coverage: String(r['Coverage'] ?? ''),
    Resolution_Type: String(r['Resolution_Type'] ?? r['ResolutionType'] ?? ''),
  }))
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function ingest(
  contractsBuffer: ArrayBuffer | Uint8Array,
  claimsBuffer: ArrayBuffer | Uint8Array,
  evalDate: Date = new Date('2025-01-31')
): IngestResult {
  // Wrap raw ArrayBuffers in Uint8Array so SheetJS gets indexed-byte access
  const toU8 = (b: ArrayBuffer | Uint8Array) =>
    b instanceof Uint8Array ? b : new Uint8Array(b)

  const cwb = XLSX.read(toU8(contractsBuffer), { type: 'array', cellDates: false })
  const clwb = XLSX.read(toU8(claimsBuffer), { type: 'array', cellDates: false })

  const cSheet = cwb.Sheets[cwb.SheetNames[0]]
  const clSheet = clwb.Sheets[clwb.SheetNames[0]]

  const rawContracts = parseContractRows(sheetToObjects(cSheet))
  const rawClaims = parseClaimRows(sheetToObjects(clSheet))

  const anchor = detectAnchor(rawContracts.map((r) => r.ContractSaleDate))
  const contracts = processContracts(rawContracts, evalDate, anchor)
  const contractMap = new Map(contracts.map((c) => [c.contractId, c]))
  const claims = processClaims(rawClaims, contractMap, evalDate)
  const triangles = buildTriangles(contracts, claims)

  const inScope = contracts.filter((c) => !c.excludedContract)
  const goodClaims = claims.filter((c) => c.goodClaim)

  const summary: IngestSummary = {
    totalContracts: contracts.length,
    totalClaims: claims.length,
    inScopeContracts: inScope.length,
    // Count raw flags (a contract can match multiple; each is counted independently)
    exclMFW: contracts.filter((c) => c.flagMFW).length,
    exclDateMisalign: contracts.filter((c) => c.flagDateMisalign).length,
    exclCancelBeforeEff: contracts.filter((c) => c.flagCancelBeforeEff).length,
    exclSaleAfterEval: contracts.filter((c) => c.flagSaleAfterEval).length,
    exclDuration: contracts.filter((c) => c.flagDuration).length,
    exclBadPremium: contracts.filter((c) => c.flagBadPremium).length,
    goodClaims: goodClaims.length,
    paidLosses: goodClaims.reduce((s, c) => s + c.cost, 0),
    writtenPremInScope: inScope.reduce((s, c) => s + c.writtenPremium, 0),
    sku1Count: inScope.filter((c) => c.sku === 'SKU1').length,
    sku2Count: inScope.filter((c) => c.sku === 'SKU2').length,
    detectedCurrentRate: detectCurrentRate(contracts),
    anchorDate: anchor,
  }

  return { triangles, summary, contracts, claims }
}
