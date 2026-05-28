// ── Raw input rows ───────────────────────────────────────────────────────────

export interface RawContract {
  ContractID: string
  ContractSaleDate: Date | null
  ContractEffectiveDate: Date | null
  ContractExpirationDate: Date | null
  ContractDuration: number | null
  ContractCancellationDate: Date | null
  WrittenPremium: number | null
  RefundPremium: number | null
  ProductType: string
  OEMWarrantyTerm: number | null
}

export interface RawClaim {
  Contract_ID: string
  Transaction_Date: Date | null
  Claim_ID: string
  Total_Claim_Cost_in_USD: number | null
  Coverage: string
  Resolution_Type: string
}

// ── Processed contract (after exclusion logic) ────────────────────────────────

export type ExclusionReason =
  | 'MFW != 12'
  | 'Duration != 5'
  | 'Date misalignment'
  | 'Sale after eval'
  | 'Bad premium'
  | 'Cancel before effective'

export interface ProcessedContract {
  contractId: string
  salePY: number            // 1-4; 0 = pre-window; 5 = post-window
  sku: 'SKU1' | 'SKU2'
  writtenPremium: number
  effectiveDate: Date | null
  expirationDate: Date | null
  cancellationDate: Date | null
  saleDate: Date | null
  excludedContract: boolean
  exclusionReason: ExclusionReason | null  // first matching flag (label)
  // raw flags — a contract can satisfy multiple; summary counts each independently
  flagMFW: boolean
  flagDuration: boolean
  flagDateMisalign: boolean
  flagSaleAfterEval: boolean
  flagBadPremium: boolean
  flagCancelBeforeEff: boolean
  monthsElapsed: number     // 0 if excluded
  quarterlyExposure: number[] // length 20, index 0 = Q1
}

export type ClaimExclusionReason =
  | 'Contract excluded'
  | 'Denied'
  | 'Zero or negative cost'
  | 'Missing Transaction_Date'
  | 'Trans after eval'
  | 'Trans before effective'
  | 'Trans after expiration'
  | 'Trans after cancellation'

export interface ProcessedClaim {
  claimId: string
  contractId: string
  salePY: number
  sku: 'SKU1' | 'SKU2'
  cost: number
  devQtr: number | null     // 1-20; null if excluded
  goodClaim: boolean
  exclusionReason: ClaimExclusionReason | null
}

// ── Triangles (4 PY × 20 quarters) ──────────────────────────────────────────

export type Triangle = number[][] // [pyIndex 0-3][qIndex 0-19]

export interface Triangles {
  exposure: Triangle   // exposure-years
  count: Triangle      // claim count
  loss: Triangle       // paid losses $
}

// ── Roster scalars from ingest ───────────────────────────────────────────────

export interface IngestSummary {
  totalContracts: number
  totalClaims: number
  inScopeContracts: number
  exclMFW: number
  exclDateMisalign: number
  exclCancelBeforeEff: number
  exclSaleAfterEval: number
  exclDuration: number
  exclBadPremium: number
  goodClaims: number
  paidLosses: number
  writtenPremInScope: number
  sku1Count: number
  sku2Count: number
  detectedCurrentRate: number
  anchorDate: Date
}

export interface IngestResult {
  triangles: Triangles
  summary: IngestSummary
  // per-contract data needed for earned-premium roll-up (minimal footprint)
  contracts: ProcessedContract[]
  claims: ProcessedClaim[]
}

// ── Analysis parameters ──────────────────────────────────────────────────────

export interface AnalysisParams {
  credibilityThreshold: number  // default 5000
  tailDecay: number             // default 0.90
  onLevel: boolean              // default false
  currentRate: number           // default 82.25
  targetLR: number              // default 0.95
  evalDate: Date                // default 2025-01-31
}

export const DEFAULT_PARAMS: AnalysisParams = {
  credibilityThreshold: 5000,
  tailDecay: 0.90,
  onLevel: false,
  currentRate: 82.25,
  targetLR: 0.95,
  evalDate: new Date('2025-01-31'),
}

// ── Emergence curve ──────────────────────────────────────────────────────────

export interface EmergencePoint {
  q: number             // 1-20
  credExposure: number
  credLoss: number
  observedPP: number
  finalPP: number
  quarterlyContribution: number
  emergencePct: number
  cumStart: number
  cumEnd: number
  isProjected: boolean
}

// ── Roll-up row (total, by PY, by SKU) ──────────────────────────────────────

export interface RollupRow {
  label: string
  contracts: number
  writtenPrem: number
  earnedPrem: number
  paidLosses: number
  goodClaims: number
  exposureYears: number
  avgPremium: number
  ultimatePP: number
  asOfLR: number
  ultimateLR: number
  method1: number
  method2: number
  frequencyAnnual: number
  severity: number
}

// ── Full analysis result ──────────────────────────────────────────────────────

export interface AnalysisResult {
  params: AnalysisParams
  emergence: EmergencePoint[]
  ultimatePP: number
  lastCredibleQ: number
  total: RollupRow
  byPY: RollupRow[]
  bySKU: RollupRow[]
  // on-level counterparts (params.onLevel flipped)
  totalOnLevel: RollupRow
  // both-method × both-toggle summary
  method1AsIncurred: number
  method2AsIncurred: number
  method1OnLevel: number
  method2OnLevel: number
}
