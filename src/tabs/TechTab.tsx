import React from 'react'

const GITHUB_URL = 'https://github.com/marshalldeese/OW-rate-analyzer-DEMO'

export default function TechTab() {
  return (
    <div className="container" style={{ padding: 'var(--space-9) var(--space-7)' }}>
      <div style={{ maxWidth: 'var(--content-max)' }}>

        <p className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>Technical Notes</p>
        <h2 style={{ marginBottom: 'var(--space-4)' }}>Under the Hood</h2>
        <p style={{ marginBottom: 'var(--space-6)', color: 'var(--ow-mute)' }}>
          How the analysis engine works, and why the architecture choices were made.
        </p>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ marginBottom: 'var(--space-8)', display: 'inline-block' }}>
          View source on GitHub →
        </a>

        <TechSection title="Client-side architecture — why no upload">
          <p>Everything runs in the browser. No server receives your files. When you drop an XLSX,
          SheetJS parses it into JavaScript objects locally; the Web Worker runs the ingest and
          aggregation step on a background thread so the UI stays responsive during the ~2-second
          parse of a 400k-row file. The parsed triangles (4 × 20 = 80 cells) are passed back
          to the main thread.</p>
          <p>From there, every sensitivity control operates only on those 80 cells plus a handful
          of scalar summary values — never on the raw rows. Recomputation is sub-millisecond
          and the dashboard updates live as sliders move.</p>
          <Code>{`ingest(rawContracts, rawClaims)     // heavy, once, in worker
  → Triangles + IngestSummary

analyze(triangles, scalars, params)  // pure, synchronous, ~0ms
  → AnalysisResult

render(AnalysisResult)               // React dashboard`}</Code>
        </TechSection>

        <TechSection title="Exclusion logic">
          <p>Contracts are excluded using a priority-ordered flag system. The first matching
          condition labels the exclusion reason; excluded contracts contribute zero exposure
          and zero claims to the triangles.</p>
          <Code>{`// Contract exclusions (priority order):
1. OEMWarrantyTerm !== 12           // MFW != 12
2. ContractDuration !== 5           // Duration != 5
3. |EffectiveDate - SaleDate| > 90  // Date misalignment
4. SaleDate > evalDate              // Sale after eval
5. WrittenPremium <= 0 or missing   // Bad premium
6. CancellationDate < EffectiveDate // Cancel before effective

// Claim exclusions (priority order):
1. Parent contract is excluded
2. Resolution_Type === "DENIED"
3. Total_Claim_Cost_in_USD <= 0 or missing
4. Transaction_Date is null
5. Transaction_Date > evalDate
6. Transaction_Date < EffectiveDate
7. Transaction_Date > ExpirationDate
8. Transaction_Date > CancellationDate`}</Code>
          <p>The "contract excluded → claim excluded" linkage (rule 1 in the claim list) is
          critical: without it, claims from excluded contracts leak into the triangles and
          inflate observed loss rates.</p>
        </TechSection>

        <TechSection title="Exposure and quarterly development">
          <p>Each contract contributes exposure-years to 20 development quarters.
          <strong> MonthsElapsed</strong> uses a 30.5-day month (chosen deliberately over
          365.25/12 ≈ 30.4375 — the 30.5 divisor is standard in ESC actuarial practice and
          is consistent with how the original analysis was performed).</p>
          <Code>{`// ExposureEnd = min(CancellationDate?, ExpirationDate, evalDate)
// MonthsElapsed = clamp((ExposureEnd - EffectiveDate) / 30.5, 0, 60)

// Quarterly exposure-years for quarter k = 1..20:
Qk = max(0, min(MonthsElapsed, 3k) - 3(k-1)) / 12

// Each full development quarter contributes 0.25 exposure-years:
// A contract alive for all 5 years = 20 quarters × 0.25 = 5.0 exp-years`}</Code>
          <p>The 0.25 factor is not an approximation — it is exact. A 5-year contract has
          exactly 5 exposure-years, spread evenly across 20 quarters of 3 months each.</p>
        </TechSection>

        <TechSection title="Emergence curve and tail projection">
          <p>The emergence curve is built per development quarter by summing only
          PY/quarter cells that meet the credibility threshold (default: ≥ 5,000 exposure-years).</p>
          <Code>{`// For each quarter q = 1..20:
CredExposure[q] = Σ Exposure[py][q]  where Exposure[py][q] >= threshold
CredLoss[q]     = Σ Loss[py][q]      (corresponding cells only)
ObservedPP[q]   = CredLoss[q] / CredExposure[q]

lastCredibleQ = max q where ObservedPP[q] > 0

// Tail projection beyond lastCredibleQ:
FinalPP[q] = FinalPP[q-1] × tailDecay    (for q > lastCredibleQ)

// Quarterly contribution and cumulative emergence:
QuarterlyContrib[q] = FinalPP[q] × 0.25
UltimatePP          = Σ QuarterlyContrib[q]  (q = 1..20)
Emergence%[q]       = QuarterlyContrib[q] / UltimatePP`}</Code>
        </TechSection>

        <TechSection title="Earned premium and on-leveling">
          <p>Earned premium is computed per contract by interpolating within the current
          development quarter using the emergence curve fractions.</p>
          <Code>{`CurrentDevQtr  = clamp(ceil(MonthsElapsed / 3), 1, 20)
MonthsIntoQtr  = MonthsElapsed - 3 × (CurrentDevQtr - 1)

EarnedFraction = CumStart[CurrentDevQtr]
               + (MonthsIntoQtr / 3) × Emergence%[CurrentDevQtr]

BasePremium    = onLevel ? currentRate : WrittenPremium
EarnedPremium  = BasePremium × EarnedFraction`}</Code>
          <p>On-leveling replaces each contract's actual WrittenPremium with the current rate
          for the earned-premium computation and average-premium denominator. Both indication
          methods move to a current-rate basis simultaneously.</p>
        </TechSection>

        <TechSection title="Rate indication — two methods">
          <Code>{`// Method 1 (loss-ratio method):
Method1 = AsOfLR / targetLR - 1
        = (PaidLosses / EarnedPremium) / targetLR - 1

// Method 2 (pure-premium method):
Method2 = UltimatePP / targetLR / AvgPremium - 1

// On-level basis: AvgPremium = currentRate (not blended)
// As-incurred:    AvgPremium = WrittenPremium / inScopeCount`}</Code>
          <p>Method 2 is the primary indication because it uses full ultimate loss cost
          rather than the as-of paid amount. Method 1 is presented alongside as a
          reasonableness check and becomes more reliable as cohorts mature.</p>
        </TechSection>

        <TechSection title="Validation targets (default parameters)">
          <p>At evaluation date 2025-01-31, credibility threshold 5,000, tail decay 0.90,
          on-level off, target LR 0.95 — the engine should produce:</p>
          <Code>{`in-scope contracts:        389,598
  excl MFW != 12:          216
  excl Date misalignment:  194
  excl Cancel<Eff:         15,866
  excl Sale after eval:    2
good claims:               17,734
paid losses:               $18,776,811
written prem (in-scope):   $30,463,411
earned prem (as-incurred): $11,026,173
earned prem (on-level):    $11,790,191
ultimate PP:               $131.90
as-of LR (as-incurred):    170.3%
Method 1 (as-incurred):    +79.3%
Method 2 (as-incurred):    +77.6%
Method 1 (on-level):       +67.6%
Method 2 (on-level):       +68.8%
last credible quarter:     Q15
cum emergence Q4/Q8/Q12/Q15/Q20:  0.6%/39.6%/69.7%/86.1%/100%`}</Code>
        </TechSection>

        <div style={{ marginTop: 'var(--space-7)' }}>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary">
            View source on GitHub →
          </a>
        </div>

      </div>
    </div>
  )
}

function TechSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-8)' }}>
      <h3 style={{ marginBottom: 'var(--space-4)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {children}
      </div>
    </div>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {children}
    </pre>
  )
}
