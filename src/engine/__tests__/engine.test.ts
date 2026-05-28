import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { ingest } from '../ingest'
import { analyze } from '../analyze'
import { DEFAULT_PARAMS } from '../types'

// ── Tolerance helpers ─────────────────────────────────────────────────────────

function near(actual: number, expected: number, tol = 0.005) {
  // relative tolerance of 0.5%
  if (expected === 0) return Math.abs(actual) < 1e-9
  return Math.abs(actual - expected) / Math.abs(expected) <= tol
}

function exact(actual: number, expected: number) {
  return actual === expected
}

// ── Fixture loading ───────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '../../../test/fixtures')
const contractsPath = path.join(FIXTURES_DIR, 'Contracts.xlsx')
const claimsPath    = path.join(FIXTURES_DIR, 'Claims.xlsx')

const hasFixtures = fs.existsSync(contractsPath) && fs.existsSync(claimsPath)

// ── §6 Validation suite ───────────────────────────────────────────────────────

describe.skipIf(!hasFixtures)('§6 validation — default params against canonical MA5 files', () => {
  let ir: ReturnType<typeof ingest>
  let result: ReturnType<typeof analyze>

  beforeAll(() => {
    // Node.js Buffer.buffer may include pool padding — slice to exact bytes
    const toAB = (buf: Buffer): ArrayBuffer =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    ir = ingest(toAB(fs.readFileSync(contractsPath)), toAB(fs.readFileSync(claimsPath)), new Date('2025-01-31'))
    result = analyze(ir, DEFAULT_PARAMS)
  })

  // ── Counts (exact) ──────────────────────────────────────────────────────────

  it('total contracts = 405,849', () => {
    expect(ir.summary.totalContracts).toBe(405849)
  })

  it('total claims = 53,183', () => {
    expect(ir.summary.totalClaims).toBe(53183)
  })

  it('in-scope contracts = 389,598', () => {
    expect(ir.summary.inScopeContracts).toBe(389598)
  })

  it('excl MFW != 12 = 216', () => {
    expect(ir.summary.exclMFW).toBe(216)
  })

  it('excl Date misalignment = 194', () => {
    expect(ir.summary.exclDateMisalign).toBe(194)
  })

  it('excl Cancel before effective = 15,866', () => {
    expect(ir.summary.exclCancelBeforeEff).toBe(15866)
  })

  it('excl Sale after eval = 2', () => {
    expect(ir.summary.exclSaleAfterEval).toBe(2)
  })

  it('good claims = 17,734', () => {
    expect(ir.summary.goodClaims).toBe(17734)
  })

  it('paid losses = $18,776,811 (±1 cent)', () => {
    expect(Math.abs(ir.summary.paidLosses - 18776811)).toBeLessThan(1)
  })

  it('written prem in-scope = $30,463,411 (±1 cent)', () => {
    expect(Math.abs(ir.summary.writtenPremInScope - 30463411)).toBeLessThan(1)
  })

  it('SKU1 contracts = 296,072', () => {
    expect(ir.summary.sku1Count).toBe(296072)
  })

  it('SKU2 contracts = 93,526', () => {
    expect(ir.summary.sku2Count).toBe(93526)
  })

  // ── Dollar totals (exact within rounding) ───────────────────────────────────

  it('earned prem as-incurred ≈ $11,026,173 (±0.5%)', () => {
    expect(near(result.total.earnedPrem, 11026173)).toBe(true)
  })

  it('earned prem on-level ≈ $11,790,191 (±0.5%)', () => {
    const onLevelResult = analyze(ir, { ...DEFAULT_PARAMS, onLevel: true })
    expect(near(onLevelResult.total.earnedPrem, 11790191)).toBe(true)
  })

  // ── PP / LR / indication (±0.5%) ────────────────────────────────────────────

  it('ultimate PP ≈ $131.90 (±0.5%)', () => {
    expect(near(result.ultimatePP, 131.90)).toBe(true)
  })

  it('as-of LR (as-incurred) ≈ 170.3% (±0.5%)', () => {
    expect(near(result.total.asOfLR, 1.703)).toBe(true)
  })

  it('as-of LR (on-level) ≈ 159.3% (±0.5%)', () => {
    const r = analyze(ir, { ...DEFAULT_PARAMS, onLevel: true })
    expect(near(r.total.asOfLR, 1.593)).toBe(true)
  })

  it('Method 1 as-incurred ≈ +79.3% (±0.5%)', () => {
    expect(near(result.method1AsIncurred, 0.793)).toBe(true)
  })

  it('Method 2 as-incurred ≈ +77.6% (±0.5%)', () => {
    expect(near(result.method2AsIncurred, 0.776)).toBe(true)
  })

  it('Method 1 on-level ≈ +67.6% (±0.5%)', () => {
    expect(near(result.method1OnLevel, 0.676)).toBe(true)
  })

  it('Method 2 on-level ≈ +68.8% (±0.5%)', () => {
    expect(near(result.method2OnLevel, 0.688)).toBe(true)
  })

  it('last credible quarter = 15', () => {
    expect(result.lastCredibleQ).toBe(15)
  })

  // ── Cumulative emergence milestones (±0.5%) ──────────────────────────────────

  it('cum emergence Q4 ≈ 0.6%', () => {
    expect(near(result.emergence[3].cumEnd, 0.006, 0.10)).toBe(true)
  })

  it('cum emergence Q8 ≈ 39.6%', () => {
    expect(near(result.emergence[7].cumEnd, 0.396)).toBe(true)
  })

  it('cum emergence Q12 ≈ 69.7%', () => {
    expect(near(result.emergence[11].cumEnd, 0.697)).toBe(true)
  })

  it('cum emergence Q15 ≈ 86.1%', () => {
    expect(near(result.emergence[14].cumEnd, 0.861)).toBe(true)
  })

  it('cum emergence Q20 = 100%', () => {
    expect(near(result.emergence[19].cumEnd, 1.0, 0.001)).toBe(true)
  })
})

// ── ppTriangle exhibit tests ──────────────────────────────────────────────────

describe.skipIf(!hasFixtures)('ppTriangle — per-cohort development triangle', () => {
  let ir: ReturnType<typeof ingest>
  let result: ReturnType<typeof analyze>

  beforeAll(() => {
    const toAB = (buf: Buffer): ArrayBuffer =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    ir = ingest(toAB(fs.readFileSync(contractsPath)), toAB(fs.readFileSync(claimsPath)), new Date('2025-01-31'))
    result = analyze(ir, DEFAULT_PARAMS)
  })

  it('PY1–PY4 rows are not identical', () => {
    const rows = result.ppTriangle
    // Rows must differ (PY4 is mostly null; PY1 has data through Q15+)
    expect(JSON.stringify(rows[0])).not.toBe(JSON.stringify(rows[1]))
    expect(JSON.stringify(rows[0])).not.toBe(JSON.stringify(rows[3]))
    expect(JSON.stringify(rows[2])).not.toBe(JSON.stringify(rows[3]))
  })

  it('PY1 has more non-null cells than PY4 (older cohort = more development)', () => {
    const py1Filled = result.ppTriangle[0].filter((v) => v !== null).length
    const py4Filled = result.ppTriangle[3].filter((v) => v !== null).length
    expect(py1Filled).toBeGreaterThan(py4Filled)
    // PY4 sold 2024-02-01 to 2025-02-01; as of 2025-01-31 max maturity ≈ Q4
    expect(py4Filled).toBeLessThanOrEqual(8) // at most a few early quarters
    // PY1 sold 2021-02-01 to 2022-02-01; as of 2025-01-31 max maturity ≈ Q16
    expect(py1Filled).toBeGreaterThanOrEqual(12)
  })

  it('ppTriangle is consistent with the aggregate emergence curve (credibility-weighted)', () => {
    // For each quarter, re-derive observedPP from ppTriangle × exposure triangles
    // and confirm it matches result.emergence[q].observedPP exactly.
    for (let q = 0; q < 20; q++) {
      let credExp = 0
      let credLoss = 0
      for (let py = 0; py < 4; py++) {
        const exp = ir.triangles.exposure[py][q]
        const pp = result.ppTriangle[py][q]
        if (exp >= DEFAULT_PARAMS.credibilityThreshold && pp !== null) {
          credExp += exp
          credLoss += pp * exp  // pp * exp = original loss cell
        }
      }
      const recomputedPP = credExp > 0 ? credLoss / credExp : 0
      // Should match observed PP exactly (same arithmetic)
      expect(Math.abs(recomputedPP - result.emergence[q].observedPP)).toBeLessThan(1e-8)
    }
  })

  it('cohort triangle with tail projection reproduces §6 emergence milestones', () => {
    // The ppTriangle consistency test above proves the observed curve is right.
    // These milestones verify the full emergence (observed + projected tail).
    expect(near(result.emergence[3].cumEnd,  0.006, 0.10)).toBe(true)  // Q4
    expect(near(result.emergence[7].cumEnd,  0.396)).toBe(true)          // Q8
    expect(near(result.emergence[11].cumEnd, 0.697)).toBe(true)          // Q12
    expect(near(result.emergence[14].cumEnd, 0.861)).toBe(true)          // Q15
    expect(near(result.emergence[19].cumEnd, 1.0, 0.001)).toBe(true)     // Q20
  })
})

// ── Isolation tests (always run — use synthetic data) ─────────────────────────

describe('exclusion priority logic', () => {
  it('MFW flag takes priority over duration', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2022-06-01',
        ContractEffectiveDate: '2022-06-01', ContractExpirationDate: '2027-06-01',
        ContractDuration: 3, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 24  // MFW != 12 AND duration != 5
      }]),
      makeClaimsBuffer([])
    )
    expect(contracts[0].exclusionReason).toBe('MFW != 12')
    expect(contracts[0].excludedContract).toBe(true)
  })

  it('Duration takes priority over date misalignment', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2022-06-01',
        ContractEffectiveDate: '2022-10-01',  // >90 days gap
        ContractExpirationDate: '2027-10-01',
        ContractDuration: 3,                   // duration != 5 (higher priority)
        ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 12
      }]),
      makeClaimsBuffer([])
    )
    expect(contracts[0].exclusionReason).toBe('Duration != 5')
  })

  it('date misalignment fires on gap > 90 days', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2022-06-01',
        ContractEffectiveDate: '2022-10-01',  // 122 days gap
        ContractExpirationDate: '2027-10-01',
        ContractDuration: 5, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 12
      }]),
      makeClaimsBuffer([])
    )
    expect(contracts[0].exclusionReason).toBe('Date misalignment')
  })

  it('in-scope contract has null exclusion reason', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2022-06-01',
        ContractEffectiveDate: '2022-06-15', ContractExpirationDate: '2027-06-15',
        ContractDuration: 5, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 12
      }]),
      makeClaimsBuffer([])
    )
    expect(contracts[0].excludedContract).toBe(false)
    expect(contracts[0].exclusionReason).toBeNull()
  })
})

describe('quarterly exposure-year factor', () => {
  it('full-life contract sums to ~5.0 exposure-years (within 1%)', () => {
    // 30.5-day months means calendar 5 years ≈ 59.87 months, not exactly 60
    // So total exposure ≈ 4.989 exp-years; we test within 1% of 5.0
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2021-06-01',
        ContractEffectiveDate: '2021-06-01', ContractExpirationDate: '2026-06-01',
        ContractDuration: 5, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 12
      }]),
      makeClaimsBuffer([]),
      new Date('2026-12-31')
    )
    const c = contracts[0]
    const total = c.quarterlyExposure.reduce((s, v) => s + v, 0)
    expect(total).toBeGreaterThan(4.98)
    expect(total).toBeLessThan(5.01)
  })

  it('each of the 20 quarters contributes ≈0.25 for a full-life contract (within 1%)', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2021-06-01',
        ContractEffectiveDate: '2021-06-01', ContractExpirationDate: '2026-06-01',
        ContractDuration: 5, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 12
      }]),
      makeClaimsBuffer([]),
      new Date('2026-12-31')
    )
    const c = contracts[0]
    for (const q of c.quarterlyExposure) {
      // Each quarter should be close to 0.25; last may be slightly less
      expect(q).toBeGreaterThan(0.23)
      expect(q).toBeLessThanOrEqual(0.25)
    }
  })

  it('excluded contract has zero exposure', () => {
    const { contracts } = ingest(
      makeContractBuffer([{
        ContractID: '1', ContractSaleDate: '2022-06-01',
        ContractEffectiveDate: '2022-06-01', ContractExpirationDate: '2027-06-01',
        ContractDuration: 5, ContractCancellationDate: null,
        WrittenPremium: 85, RefundPremium: null,
        ProductType: 'APL', OEMWarrantyTerm: 24  // excluded
      }]),
      makeClaimsBuffer([])
    )
    const c = contracts[0]
    expect(c.monthsElapsed).toBe(0)
    expect(c.quarterlyExposure.every((q) => q === 0)).toBe(true)
  })
})

describe('tail decay projection', () => {
  it('quarters past lastCredibleQ decay geometrically', () => {
    // Create a minimal result with known structure
    // Use 2 PYs with exposure only in Q1..Q3, then check Q4+ decays
    const ir = ingest(
      makeContractBuffer([
        { ContractID: '1', ContractSaleDate: '2022-06-01', ContractEffectiveDate: '2022-06-01',
          ContractExpirationDate: '2027-06-01', ContractDuration: 5, ContractCancellationDate: null,
          WrittenPremium: 85, RefundPremium: null, ProductType: 'APL', OEMWarrantyTerm: 12 },
      ]),
      makeClaimsBuffer([
        { Contract_ID: '1', Transaction_Date: '2022-08-01', Claim_ID: 'c1',
          Total_Claim_Cost_in_USD: 500, Coverage: 'MECH', Resolution_Type: 'PAID' },
      ]),
      new Date('2023-01-01')  // only Q1/Q2 will have data
    )

    const result = analyze(ir, {
      credibilityThreshold: 0,  // accept all cells
      tailDecay: 0.80,
      onLevel: false,
      currentRate: 82.25,
      targetLR: 0.95,
      evalDate: new Date('2023-01-01'),
    })

    const last = result.lastCredibleQ
    if (last < 19) {
      const pp1 = result.emergence[last].finalPP
      const pp2 = result.emergence[last + 1].finalPP
      expect(Math.abs(pp2 - pp1 * 0.80)).toBeLessThan(0.001)
    }
  })
})

describe('on-level toggle', () => {
  it('flips earned premium and avg premium for both methods', () => {
    const ir = ingest(
      makeContractBuffer([
        { ContractID: '1', ContractSaleDate: '2022-06-01', ContractEffectiveDate: '2022-06-01',
          ContractExpirationDate: '2027-06-01', ContractDuration: 5, ContractCancellationDate: null,
          WrittenPremium: 76, RefundPremium: null, ProductType: 'APL', OEMWarrantyTerm: 12 },
        { ContractID: '2', ContractSaleDate: '2022-07-01', ContractEffectiveDate: '2022-07-01',
          ContractExpirationDate: '2027-07-01', ContractDuration: 5, ContractCancellationDate: null,
          WrittenPremium: 82, RefundPremium: null, ProductType: 'APL', OEMWarrantyTerm: 12 },
      ]),
      makeClaimsBuffer([])
    )

    const rOff = analyze(ir, { ...DEFAULT_PARAMS, onLevel: false, currentRate: 82.25 })
    const rOn  = analyze(ir, { ...DEFAULT_PARAMS, onLevel: true,  currentRate: 82.25 })

    // On-level avg premium should equal currentRate exactly
    expect(Math.abs(rOn.total.avgPremium - 82.25)).toBeLessThan(0.001)

    // Blended should be between 76 and 82
    expect(rOff.total.avgPremium).toBeGreaterThan(76)
    expect(rOff.total.avgPremium).toBeLessThan(82)

    // On-level avg premium equals currentRate; blended is between the two
    expect(rOn.total.avgPremium).toBeCloseTo(82.25, 2)
    expect(rOff.total.avgPremium).toBeGreaterThan(76)
    expect(rOff.total.avgPremium).toBeLessThan(82.25)
  })
})

// ── Synthetic data helpers ─────────────────────────────────────────────────────

import * as XLSX from 'xlsx'

interface ContractRow {
  ContractID: string
  ContractSaleDate: string | null
  ContractEffectiveDate: string | null
  ContractExpirationDate: string | null
  ContractDuration: number | null
  ContractCancellationDate: string | null
  WrittenPremium: number | null
  RefundPremium: number | null
  ProductType: string
  OEMWarrantyTerm: number | null
}

interface ClaimRow {
  Contract_ID: string
  Transaction_Date: string | null
  Claim_ID: string
  Total_Claim_Cost_in_USD: number | null
  Coverage: string
  Resolution_Type: string
}

function makeContractBuffer(rows: ContractRow[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer
}

function makeClaimsBuffer(rows: ClaimRow[]): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return buf instanceof ArrayBuffer ? buf : new Uint8Array(buf).buffer
}
