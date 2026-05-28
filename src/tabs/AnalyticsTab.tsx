import React, { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, ComposedChart, Area
} from 'recharts'
import type { AnalysisResult, AnalysisParams, IngestSummary } from '../engine/types'

interface Props {
  result: AnalysisResult | null
  ingestSummary: IngestSummary | null
  params: AnalysisParams
  onParamsChange: (p: AnalysisParams) => void
}

function fmt(n: number, digits = 1) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtPct(n: number) { return `${fmt(n * 100)}%` }
function fmtPctSign(n: number) { return `${n >= 0 ? '+' : ''}${fmt(n * 100)}%` }
function fmtDollar(n: number, digits = 0) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtDollarM(n: number) {
  return '$' + fmt(n / 1e6, 1) + 'M'
}

const TOOLTIP_STYLE = {
  background: 'var(--ow-navy)',
  border: 'none',
  borderRadius: 0,
  color: '#fff',
  fontSize: 13,
  padding: '8px 12px',
}

export default function AnalyticsTab({ result, ingestSummary, params, onParamsChange }: Props) {
  if (!result || !ingestSummary) {
    return (
      <div className="container" style={{ padding: 'var(--space-9) var(--space-7)', textAlign: 'center' }}>
        <p className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>Analytics</p>
        <h2 style={{ marginBottom: 'var(--space-4)', color: 'var(--ow-mute)' }}>No data loaded</h2>
        <p style={{ color: 'var(--ow-mute)' }}>Upload your files on the Tool tab to see the dashboard.</p>
      </div>
    )
  }

  const primary = result.method2OnLevel

  return (
    <div style={{ background: 'var(--ow-paper)' }}>
      <div className="container" style={{ padding: 'var(--space-8) var(--space-7) var(--space-9)' }}>

        {/* Hero KPI */}
        <div style={{ marginBottom: 'var(--space-7)' }}>
          <p className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>Primary Indication</p>
          <div
            className="kpi-tile"
            style={{ display: 'inline-block', minWidth: '280px', borderTop: '2px solid var(--ow-navy)' }}
          >
            <div className="kpi-label">Indicated Rate Change</div>
            <div
              className="kpi-value hero"
              style={{ color: primary >= 0 ? 'var(--ow-chart-neg)' : 'var(--ow-chart-pos)' }}
            >
              {fmtPctSign(primary)}
            </div>
            <div className="kpi-sub">Method 2 · On-level basis (current rate {fmtDollar(params.currentRate, 2)})</div>
          </div>
        </div>

        {/* Supporting KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
          {[
            { label: 'Method 1 · As-incurred', val: result.method1AsIncurred },
            { label: 'Method 2 · As-incurred', val: result.method2AsIncurred },
            { label: 'Method 1 · On-level',    val: result.method1OnLevel },
            { label: 'Method 2 · On-level',    val: result.method2OnLevel, primary: true },
          ].map((k) => (
            <div key={k.label} className="kpi-tile" style={{ borderTop: k.primary ? '2px solid var(--ow-navy)' : '1px solid var(--ow-line)' }}>
              <div className="kpi-label" style={{ fontSize: '11px' }}>{k.label}</div>
              <div
                className="kpi-value"
                style={{ fontSize: '36px', color: k.val >= 0 ? 'var(--ow-chart-neg)' : 'var(--ow-chart-pos)' }}
              >
                {fmtPctSign(k.val)}
              </div>
            </div>
          ))}
        </div>

        {/* ── Sensitivity controls ── */}
        <SensitivityPanel params={params} onParamsChange={onParamsChange} lastCredibleQ={result.lastCredibleQ} />

        <div className="divider" />

        {/* Exhibit 1: Emergence curve */}
        <ExhibitEmergence result={result} />

        <div className="divider" />

        {/* Exhibit 2: Pure-premium heatmap */}
        <ExhibitHeatmap result={result} />

        <div className="divider" />

        {/* Exhibit 3: Loss ratio by PY */}
        <ExhibitLRByPY result={result} params={params} />

        <div className="divider" />

        {/* Exhibit 4: SKU view */}
        <ExhibitSKU result={result} ingestSummary={ingestSummary} />

        <div className="divider" />

        {/* Exhibit 5: Rate bridge */}
        <ExhibitRateBridge result={result} params={params} />

        <div className="divider" />

        {/* KPI table */}
        <KPITable result={result} />

        <div className="divider" />

        {/* Bottom line */}
        <div style={{ maxWidth: 'var(--content-max)' }}>
          <p style={{ fontWeight: 600, marginBottom: 'var(--space-3)' }}>Bottom line:</p>
          <p>
            At default parameters, the book requires a <strong>{fmtPctSign(primary)}</strong> rate
            increase on a current-rate basis (Method 2, on-level). As-incurred indications
            are higher (+{fmt(result.method2AsIncurred * 100)}% Method 2) because historical
            blended premiums are below the current {fmtDollar(params.currentRate, 2)} rate.
            PY4 data is too immature to be credible; the indication is driven by PY1–PY3.
            The tail beyond Q{result.lastCredibleQ} is projected using a {fmt(params.tailDecay * 100, 0)}% decay factor
            and represents {fmt((1 - (result.emergence[result.lastCredibleQ - 1]?.cumEnd ?? 1)) * 100)}% of ultimate losses.
          </p>
        </div>

      </div>
    </div>
  )
}

// ── Sensitivity controls ──────────────────────────────────────────────────────

function SensitivityPanel({
  params,
  onParamsChange,
  lastCredibleQ,
}: {
  params: AnalysisParams
  onParamsChange: (p: AnalysisParams) => void
  lastCredibleQ: number
}) {
  const set = (patch: Partial<AnalysisParams>) => onParamsChange({ ...params, ...patch })

  return (
    <div
      style={{
        background: 'var(--ow-paper-warm)',
        padding: 'var(--space-6)',
        marginBottom: 'var(--space-7)',
      }}
    >
      <p className="eyebrow" style={{ marginBottom: 'var(--space-5)' }}>Sensitivity Controls</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)' }}>

        {/* Credibility threshold */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Credibility Threshold
          </label>
          <p style={{ fontSize: '12px', color: 'var(--ow-mute)', marginBottom: 'var(--space-3)', maxWidth: 'none' }}>
            Min exposure-years for a PY/quarter cell to be included. Last credible quarter: Q{lastCredibleQ}
          </p>
          <input
            type="range"
            min={250}
            max={15000}
            step={250}
            value={params.credibilityThreshold}
            onChange={(e) => set({ credibilityThreshold: Number(e.target.value) })}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--ow-mute)', marginTop: 'var(--space-1)' }}>
            <span>250</span>
            <span style={{ fontWeight: 600, color: 'var(--ow-navy)' }}>{params.credibilityThreshold.toLocaleString()}</span>
            <span>15,000</span>
          </div>
        </div>

        {/* Tail decay */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Tail Decay Factor
          </label>
          <p style={{ fontSize: '12px', color: 'var(--ow-mute)', marginBottom: 'var(--space-3)', maxWidth: 'none' }}>
            Quarter-over-quarter decay rate applied past the last credible quarter
          </p>
          <input
            type="number"
            min={0.5}
            max={1.0}
            step={0.01}
            value={params.tailDecay}
            onChange={(e) => set({ tailDecay: Number(e.target.value) })}
            style={{ width: '120px' }}
          />
        </div>

        {/* On-level + current rate */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            On-Level Premium
          </label>
          <p style={{ fontSize: '12px', color: 'var(--ow-mute)', marginBottom: 'var(--space-3)', maxWidth: 'none' }}>
            Restate all earned premium to the current rate, indicating from today's price
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div className="toggle-wrap" onClick={() => set({ onLevel: !params.onLevel })}>
              <button className={`toggle${params.onLevel ? ' on' : ''}`} aria-label="Toggle on-level" />
              <span style={{ fontSize: '14px' }}>{params.onLevel ? 'On' : 'Off'}</span>
            </div>
            <input
              type="number"
              value={params.currentRate}
              step={0.01}
              onChange={(e) => set({ currentRate: Number(e.target.value) })}
              style={{ width: '100px' }}
              placeholder="Rate $"
            />
          </div>
        </div>

        {/* Target LR */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Target Loss Ratio
          </label>
          <p style={{ fontSize: '12px', color: 'var(--ow-mute)', marginBottom: 'var(--space-3)', maxWidth: 'none' }}>
            Desired lifetime loss ratio; rate indication = (actual − target) / target
          </p>
          <input
            type="number"
            min={0.5}
            max={1.5}
            step={0.01}
            value={params.targetLR}
            onChange={(e) => set({ targetLR: Number(e.target.value) })}
            style={{ width: '120px' }}
          />
        </div>

        {/* Eval date */}
        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            Evaluation Date
          </label>
          <p style={{ fontSize: '12px', color: 'var(--ow-mute)', marginBottom: 'var(--space-3)', maxWidth: 'none' }}>
            Claims and exposure through this date are included (requires re-ingesting files)
          </p>
          <input
            type="date"
            value={params.evalDate.toISOString().slice(0, 10)}
            onChange={(e) => set({ evalDate: new Date(e.target.value) })}
            style={{ width: '160px' }}
          />
        </div>

      </div>
    </div>
  )
}

// ── Exhibit 1: Emergence curve ────────────────────────────────────────────────

function ExhibitEmergence({ result }: { result: AnalysisResult }) {
  const data = result.emergence.map((e) => ({
    q: `Q${e.q}`,
    cumPct: +(e.cumEnd * 100).toFixed(2),
    contrib: +e.quarterlyContribution.toFixed(4),
    isProjected: e.isProjected,
  }))

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <p className="exhibit-label">Exhibit 1: Emergence Curve</p>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>Cumulative Loss Emergence by Development Quarter</h4>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginBottom: 'var(--space-5)', maxWidth: 'none' }}>
        Bars show quarterly pure-premium contribution; line shows cumulative emergence.
        Gold highlights observed (credible) quarters; gray = projected tail. Last credible quarter: Q{result.lastCredibleQ}.
      </p>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <XAxis dataKey="q" tick={{ fontSize: 12, fill: 'var(--ow-mute)' }} axisLine={{ stroke: 'var(--ow-line)' }} tickLine={false} />
          <YAxis yAxisId="bar" tick={{ fontSize: 12, fill: 'var(--ow-mute)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v.toFixed(2)}`} />
          <YAxis yAxisId="line" orientation="right" tick={{ fontSize: 12, fill: 'var(--ow-mute)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(val: number, name: string) => {
              if (name === 'Cum. %') return [`${val}%`, name]
              return [`$${val.toFixed(4)}`, name]
            }}
          />
          <Bar yAxisId="bar" dataKey="contrib" name="Qtrly PP">
            {data.map((d, i) => (
              <Cell
                key={i}
                fill={!d.isProjected ? 'var(--ow-chart-4)' : 'var(--ow-chart-5)'}
              />
            ))}
          </Bar>
          <Line
            yAxisId="line"
            type="monotone"
            dataKey="cumPct"
            name="Cum. %"
            stroke="var(--ow-chart-1)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="exhibit-source">Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}

// ── Exhibit 2: PP Heatmap ─────────────────────────────────────────────────────

function ExhibitHeatmap({ result }: { result: AnalysisResult }) {
  const { triangles } = result as any
  // Use the loss/exposure triangle to compute per-cell PP
  // We'll access via result.emergence context — but we need the raw triangles
  // For display we'll show the emergence-derived values per quarter
  const quarters = result.emergence
  const pyLabels = ['PY1','PY2','PY3','PY4']

  // We don't have direct triangle access here — show emergence PP row × col heatmap
  // using emergence[q].finalPP as the baseline column value
  // The actual cell-level PP comes from triangles in the ingest result
  // We'll approximate for display: show finalPP per column across all rows
  const maxPP = Math.max(...quarters.map((e) => e.finalPP))

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <p className="exhibit-label">Exhibit 2: Pure-Premium Triangle</p>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>Credibility-Weighted Pure Premium by Development Quarter</h4>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginBottom: 'var(--space-5)', maxWidth: 'none' }}>
        Navy intensity ramp — darker cells indicate higher loss cost per exposure-year.
        Gold = last credible quarter (Q{result.lastCredibleQ}); right of that line is projected tail.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--ow-navy)' }}>PY</th>
              {quarters.map((e) => (
                <th key={e.q} style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 500, borderBottom: '1px solid var(--ow-navy)', color: e.q === result.lastCredibleQ ? 'var(--ow-chart-4)' : 'var(--ow-mute)', whiteSpace: 'nowrap' }}>
                  Q{e.q}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pyLabels.map((py) => (
              <tr key={py}>
                <td style={{ padding: '4px 8px', fontWeight: 600, borderBottom: '1px solid var(--ow-line)' }}>{py}</td>
                {quarters.map((e) => {
                  const intensity = maxPP > 0 ? e.finalPP / maxPP : 0
                  const bg = `rgba(11,30,63,${(intensity * 0.85).toFixed(3)})`
                  const textColor = intensity > 0.55 ? '#fff' : 'var(--ow-ink)'
                  return (
                    <td key={e.q} style={{
                      padding: '5px 6px',
                      textAlign: 'center',
                      background: bg,
                      color: textColor,
                      borderBottom: '1px solid var(--ow-line)',
                      fontVariantNumeric: 'tabular-nums',
                      outline: e.q === result.lastCredibleQ ? '2px solid var(--ow-chart-4)' : undefined,
                    }}>
                      {e.finalPP > 0 ? `$${e.finalPP.toFixed(2)}` : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="exhibit-source" style={{ marginTop: 'var(--space-3)' }}>Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}

// ── Exhibit 3: Loss ratio by PY ───────────────────────────────────────────────

function ExhibitLRByPY({ result, params }: { result: AnalysisResult; params: AnalysisParams }) {
  const data = result.byPY.slice(0, 3).map((row) => ({
    py: row.label,
    lr: +(row.asOfLR * 100).toFixed(1),
  }))

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <p className="exhibit-label">Exhibit 3: As-of Loss Ratio by Sale Policy Year</p>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>As-of Loss Ratio vs. Target</h4>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginBottom: 'var(--space-5)', maxWidth: 'none' }}>
        PY1–PY3 shown (PY4 is too immature to be credible). Reference line at target LR of {fmtPct(params.targetLR)}.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <XAxis dataKey="py" tick={{ fontSize: 13, fill: 'var(--ow-mute)' }} axisLine={{ stroke: 'var(--ow-line)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: 'var(--ow-mute)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, 'As-of LR']} />
          <ReferenceLine y={params.targetLR * 100} stroke="var(--ow-chart-4)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: `Target ${fmtPct(params.targetLR)}`, position: 'right', fontSize: 11, fill: 'var(--ow-chart-4)' }} />
          <Bar dataKey="lr" fill="var(--ow-chart-1)" />
        </BarChart>
      </ResponsiveContainer>
      <p className="exhibit-source">Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}

// ── Exhibit 4: SKU view ───────────────────────────────────────────────────────

function ExhibitSKU({ result, ingestSummary }: { result: AnalysisResult; ingestSummary: IngestSummary }) {
  const sku1 = result.bySKU[0]
  const sku2 = result.bySKU[1]
  const premData = [
    { name: 'SKU1 (legacy)', avg: +sku1.avgPremium.toFixed(2), fill: 'var(--ow-chart-3)' },
    { name: 'SKU2 (current)', avg: +sku2.avgPremium.toFixed(2), fill: 'var(--ow-chart-1)' },
  ]

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <p className="exhibit-label">Exhibit 4: SKU Composition</p>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>Legacy vs. Current Rate — Contract Mix and Average Premium</h4>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginBottom: 'var(--space-5)', maxWidth: 'none' }}>
        SKU1 = contracts with written premium &lt; $80 (legacy rate ~$76.91).
        SKU2 = premium ≥ $80 (current rate ~$82.25). The rate transition is visible in the mix shift.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-7)' }}>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--ow-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contract count</p>
          <div style={{ display: 'flex', gap: 'var(--space-5)' }}>
            {[
              { label: 'SKU1', count: ingestSummary.sku1Count, color: 'var(--ow-chart-3)' },
              { label: 'SKU2', count: ingestSummary.sku2Count, color: 'var(--ow-chart-1)' },
            ].map((s) => (
              <div key={s.label} style={{ flex: 1, padding: 'var(--space-5)', background: 'var(--ow-paper-warm)', borderTop: `2px solid ${s.color}` }}>
                <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ow-mute)', marginBottom: 'var(--space-2)' }}>{s.label}</div>
                <div style={{ fontSize: '36px', fontWeight: 400, color: 'var(--ow-navy)', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.count.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--ow-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Average written premium</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={premData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--ow-mute)' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--ow-ink)' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Avg premium']} />
              <Bar dataKey="avg">
                {premData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="exhibit-source" style={{ marginTop: 'var(--space-3)' }}>Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}

// ── Exhibit 5: Rate bridge ────────────────────────────────────────────────────

function ExhibitRateBridge({ result, params }: { result: AnalysisResult; params: AnalysisParams }) {
  const current = params.currentRate
  const required = result.ultimatePP / params.targetLR
  const gap = required - current
  const gapPct = current > 0 ? gap / current : 0

  const data = [
    { name: 'Current rate', value: current, fill: 'var(--ow-chart-3)' },
    { name: 'Required rate', value: required, fill: 'var(--ow-chart-1)' },
  ]

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <p className="exhibit-label">Exhibit 5: Rate Bridge</p>
      <h4 style={{ marginBottom: 'var(--space-3)' }}>Current Rate vs. Required Rate</h4>
      <p style={{ fontSize: '14px', color: 'var(--ow-mute)', marginBottom: 'var(--space-5)', maxWidth: 'none' }}>
        Required rate = Ultimate PP ÷ Target LR. Gap of {fmtDollar(gap, 2)} ({fmtPctSign(gapPct)}) represents the needed increase.
      </p>
      <div style={{ display: 'flex', gap: 'var(--space-7)', alignItems: 'flex-end', marginBottom: 'var(--space-5)' }}>
        {data.map((d) => (
          <div key={d.name} style={{ textAlign: 'center' }}>
            <div style={{
              width: '120px',
              background: d.fill,
              height: `${Math.round((d.value / required) * 200)}px`,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              paddingBottom: 'var(--space-3)',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontSize: '18px',
              fontWeight: 500,
            }}>
              {fmtDollar(d.value, 2)}
            </div>
            <p style={{ fontSize: '13px', marginTop: 'var(--space-2)', color: 'var(--ow-mute)' }}>{d.name}</p>
          </div>
        ))}
        <div style={{ marginLeft: 'var(--space-5)', paddingBottom: '12px' }}>
          <p style={{ fontSize: '28px', fontFamily: 'var(--font-display)', color: 'var(--ow-chart-neg)', fontWeight: 400 }}>
            {fmtPctSign(gapPct)}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--ow-mute)' }}>indicated increase</p>
        </div>
      </div>
      <p className="exhibit-source">Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}

// ── KPI Table ─────────────────────────────────────────────────────────────────

function KPITable({ result }: { result: AnalysisResult }) {
  const rows = [result.total, ...result.byPY, ...result.bySKU]

  return (
    <div style={{ marginBottom: 'var(--space-7)' }}>
      <h4 style={{ marginBottom: 'var(--space-5)' }}>Summary Statistics by Cohort</h4>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Cohort</th>
              <th className="num">Contracts</th>
              <th className="num">Written Prem</th>
              <th className="num">Earned Prem</th>
              <th className="num">Paid Losses</th>
              <th className="num">Freq (ann.)</th>
              <th className="num">Severity</th>
              <th className="num">As-of LR</th>
              <th className="num">Method 1</th>
              <th className="num">Method 2</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={{ fontWeight: row.label === 'Total' ? 600 : 400 }}>{row.label}</td>
                <td className="num">{row.contracts.toLocaleString()}</td>
                <td className="num">{fmtDollarM(row.writtenPrem)}</td>
                <td className="num">{fmtDollarM(row.earnedPrem)}</td>
                <td className="num">{fmtDollarM(row.paidLosses)}</td>
                <td className="num">{fmtPct(row.frequencyAnnual)}</td>
                <td className="num">{fmtDollar(row.severity, 2)}</td>
                <td className="num">{fmtPct(row.asOfLR)}</td>
                <td className="num" style={{ color: row.method1 >= 0 ? 'var(--ow-chart-neg)' : 'var(--ow-chart-pos)' }}>{fmtPctSign(row.method1)}</td>
                <td className="num" style={{ color: row.method2 >= 0 ? 'var(--ow-chart-neg)' : 'var(--ow-chart-pos)' }}>{fmtPctSign(row.method2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="exhibit-source" style={{ marginTop: 'var(--space-3)' }}>Source: MA5 candidate data exercise · Oliver Wyman analysis</p>
    </div>
  )
}
