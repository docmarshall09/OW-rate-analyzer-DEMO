import React from 'react'

export default function GuideTab() {
  return (
    <div className="container" style={{ padding: 'var(--space-9) var(--space-7)' }}>
      <div style={{ maxWidth: 'var(--content-max)' }}>

        <p className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>Methodology Guide</p>
        <h2 style={{ marginBottom: 'var(--space-6)' }}>
          Extended Service Contracts:<br />Rate Adequacy in Practice
        </h2>

        <Section eyebrow="01" title="What is an extended service contract?">
          <p>An extended service contract (ESC) — sold alongside major appliances — provides repair
          or replacement coverage after the manufacturer's warranty expires. The policyholder pays
          a fixed premium at point of sale; the administrator bears the obligation to pay all
          qualifying repair claims over the contract's life (typically five years).</p>
          <p>Because the premium is collected upfront but claims emerge over years, the program
          is inherently pre-funded. Rate adequacy asks: is the premium collected today sufficient
          to cover the losses that will ultimately develop on this book?</p>
          <Stat value="5 years" label="Typical ESC contract duration" />
          <BottomLine>
            Rate inadequacy on ESC programs compounds silently — you won't see the full loss
            picture for several years after sale, by which time millions in underpriced premium
            has already been written.
          </BottomLine>
        </Section>

        <Section eyebrow="02" title="The cohort-and-development approach">
          <p>We group contracts by <strong>Sale Policy Year (PY)</strong> — the 12-month window
          in which they were sold. Within each cohort, we track losses as they emerge across
          20 development quarters (the full 5-year contract life, in 3-month increments).</p>
          <p>This produces a <strong>triangle</strong>: rows are sale cohorts (PY1–PY4); columns
          are development quarters (Q1–Q20). Each cell records exposure-years, claim count,
          and paid losses. Older cohorts have data in more columns; newer cohorts have data
          only in early columns.</p>
          <p>The triangle structure lets us separate two questions: (1) how much loss is a given
          cohort ultimately going to produce? and (2) what fraction has emerged so far?</p>
          <BottomLine>
            A triangle with four PY rows and twenty dev-quarter columns gives us ~80 cells of
            data to fit an emergence curve and project the tail.
          </BottomLine>
        </Section>

        <Section eyebrow="03" title="Pure premium and the emergence curve">
          <p><strong>Pure premium (PP)</strong> is losses per exposure-year — the unit cost of
          the risk. It equals frequency (claims per exposure-year) times severity (cost per claim),
          but computing it directly as Loss ÷ Exposure is preferred because it is volume-weighted.</p>
          <p>Losses don't all happen in year one. Early in a contract's life, the manufacturer's
          warranty is still in force; most appliance repairs are covered by the OEM. Claim
          frequency ramps up as the OEM warranty ages out, peaks around quarters 5–10, then
          declines as the appliance ages out of service or the contract term ends.</p>
          <p>The <strong>emergence curve</strong> captures this pattern. We compute observed PP
          for each development quarter (summing only over cohorts with sufficient exposure for
          credibility), then project the remaining quarters using a geometric tail decay factor.</p>
          <p>Each quarter contributes <code>PP × 0.25</code> to <strong>ultimate PP</strong>
          — the 0.25 converts from per-exposure-year to per-quarter (each of the 20 quarters
          is one quarter of a contract-year). Ultimate PP is the lifetime expected cost per
          in-scope contract.</p>
          <Stat value="Q15" label="Last credible quarter (default params)" />
          <BottomLine>
            The emergence curve is the analytical engine. Everything else — earned premium,
            loss ratios, the rate indication — flows from it.
          </BottomLine>
        </Section>

        <Section eyebrow="04" title="Two indication methods">
          <p>We report two indication methods, both anchored to the same target loss ratio (default 95%):</p>
          <p><strong>Method 1 — Loss-ratio method.</strong> Compare the as-of (earned) loss ratio
          to the target. <code>Indication = As-of LR ÷ Target LR − 1</code>. This is a direct
          comparison of dollars in (earned premium) vs. dollars out (paid losses), but it is
          sensitive to how far the book has developed — early-cohort books look too favorable
          because losses are still emerging.</p>
          <p><strong>Method 2 — Pure-premium method.</strong> Compare the ultimate expected cost
          to the rate. <code>Indication = Ultimate PP ÷ Target LR ÷ Avg Premium − 1</code>.
          This accounts for full ultimate loss cost and is the primary method when credible
          development data is available.</p>
          <p>Both methods are reported on an as-incurred basis (actual premiums) and on an
          on-level basis (all premium restated to the current rate). The on-level number is
          the primary indication.</p>
          <BottomLine>
            Method 2 on-level is the headline: it answers "how much do we need to change
            today's rate?" rather than "how has the blended book performed historically?"
          </BottomLine>
        </Section>

        <Section eyebrow="05" title="On-leveling and the SKU1 / SKU2 finding">
          <p>This book has two effective rate points: a legacy rate (~$76.91, contracts with
          written premium below $80, labeled <strong>SKU1</strong>) and a current rate
          (~$82.25, labeled <strong>SKU2</strong>). The retailer already implemented a
          roughly 7% increase; the legacy contracts in the book were written at the lower price.</p>
          <p><strong>On-leveling</strong> restates all historical premiums to the current rate.
          This removes the distortion caused by the rate mix: without on-leveling, the blended
          average premium is below today's rate, and the indication looks worse than it actually
          is from today's starting point.</p>
          <p>With on-leveling off, the as-incurred Method 2 indication is +77.6%. With
          on-leveling on, the indication is +68.8%. The ~9-point gap is attributable entirely
          to the legacy rate dragging the blended average down.</p>
          <Stat value="~7%" label="Premium increase already implemented (SKU1 → SKU2)" />
          <BottomLine>
            The on-level Method 2 number — +68.8% at default parameters — is the actionable
            finding. It tells the client how much additional increase is needed from the rate
            already in market.
          </BottomLine>
        </Section>

        <Section eyebrow="06" title="What the sensitivity levers do">
          <p><strong>Credibility threshold.</strong> Minimum exposure-years required before a
          PY/quarter cell contributes to the observed emergence curve. Higher thresholds make
          the curve more conservative (fewer observed quarters, more tail-projected) but also
          more stable. At 5,000 exposure-years, the last credible quarter is Q15.</p>
          <p><strong>Tail decay.</strong> The quarter-over-quarter decay factor applied to PP
          beyond the last credible quarter. A factor of 0.90 means each projected quarter
          carries 90% of the prior quarter's PP. Reducing this makes the tail lighter and
          lowers the ultimate PP (and indication); increasing it toward 1.0 keeps losses
          flat in the tail.</p>
          <p><strong>On-level toggle / current rate.</strong> Switches all earned premium and
          average premium to the current rate. Both indication methods move together onto a
          current-rate basis. The current rate auto-detects from the most recently sold cohort
          but can be overridden.</p>
          <p><strong>Target loss ratio.</strong> The desired lifetime loss ratio. ESC programs
          often target 0.90–0.95; changing this shifts both methods proportionally.</p>
          <BottomLine>
            The controls are calibrated for real sensitivity analysis, not just decoration.
            A 0.05-step change in tail decay or a 1,000-unit shift in credibility threshold
            can move the indication by several percentage points.
          </BottomLine>
        </Section>

      </div>
    </div>
  )
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-9)' }}>
      <p className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>{eyebrow}</p>
      <h3 style={{ marginBottom: 'var(--space-5)' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {children}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ borderTop: '1px solid var(--ow-line)', paddingTop: 'var(--space-5)', margin: 'var(--space-2) 0' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '56px', fontWeight: 400, lineHeight: 1.0, color: 'var(--ow-navy)', letterSpacing: '-0.015em' }}>
        {value}
      </div>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginTop: 'var(--space-2)', maxWidth: 'none' }}>{label}</p>
    </div>
  )
}

function BottomLine({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ borderLeft: '2px solid var(--ow-navy)', paddingLeft: 'var(--space-4)', maxWidth: 'none' }}>
      <strong>Bottom line:</strong> {children}
    </p>
  )
}
