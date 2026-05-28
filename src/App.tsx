import React, { useState, useEffect, useCallback } from 'react'
import type { IngestResult, AnalysisResult, AnalysisParams } from './engine/types'
import { DEFAULT_PARAMS } from './engine/types'
import { analyze } from './engine/analyze'
import Header from './components/Header'
import TabBar from './components/TabBar'
import ToolTab from './tabs/ToolTab'
import GuideTab from './tabs/GuideTab'
import AnalyticsTab from './tabs/AnalyticsTab'
import TechTab from './tabs/TechTab'

export type TabId = 'tool' | 'guide' | 'analytics' | 'tech'

const TABS: { id: TabId; label: string; title: string }[] = [
  { id: 'tool',      label: 'Tool',      title: 'MA5 Rate Analyzer — Tool' },
  { id: 'guide',     label: 'Guide',     title: 'MA5 Rate Analyzer — Methodology Guide' },
  { id: 'analytics', label: 'Analytics', title: 'MA5 Rate Analyzer — Analytics Dashboard' },
  { id: 'tech',      label: 'Tech',      title: 'MA5 Rate Analyzer — Technical Notes' },
]

function getInitialTab(): TabId {
  const hash = window.location.hash.replace('#', '')
  return (TABS.find((t) => t.id === hash)?.id ?? 'tool') as TabId
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(getInitialTab)
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null)
  const [params, setParams] = useState<AnalysisParams>(DEFAULT_PARAMS)
  const [result, setResult] = useState<AnalysisResult | null>(null)

  // Hash routing
  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab)
    window.location.hash = activeTab
    document.title = tab?.title ?? 'MA5 Rate Analyzer'
  }, [activeTab])

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      const tab = TABS.find((t) => t.id === hash)
      if (tab) setActiveTab(tab.id)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Re-analyze on param changes (instant — operates on aggregated triangles)
  useEffect(() => {
    if (!ingestResult) return
    setResult(analyze(ingestResult, params))
  }, [ingestResult, params])

  const handleIngestDone = useCallback((ir: IngestResult) => {
    // Auto-populate current rate from detected value
    setParams((p) => ({ ...p, currentRate: ir.summary.detectedCurrentRate }))
    setIngestResult(ir)
    setActiveTab('analytics')
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ow-paper)' }}>
      <Header />
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
      <main>
        {activeTab === 'tool' && (
          <ToolTab onIngestDone={handleIngestDone} params={params} />
        )}
        {activeTab === 'guide' && <GuideTab />}
        {activeTab === 'analytics' && (
          <AnalyticsTab
            result={result}
            ingestSummary={ingestResult?.summary ?? null}
            params={params}
            onParamsChange={setParams}
          />
        )}
        {activeTab === 'tech' && <TechTab />}
      </main>
    </div>
  )
}
