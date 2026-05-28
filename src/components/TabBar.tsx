import React, { useRef, useEffect, useState } from 'react'
import type { TabId } from '../App'

interface Tab {
  id: TabId
  label: string
}

interface Props {
  tabs: Tab[]
  active: TabId
  onChange: (id: TabId) => void
}

export default function TabBar({ tabs, active, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  useEffect(() => {
    const el = containerRef.current?.querySelector(
      `[data-tab="${active}"]`
    ) as HTMLElement | null
    if (el) {
      const parent = containerRef.current!.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      setIndicatorStyle({
        left: rect.left - parent.left,
        width: rect.width,
      })
    }
  }, [active])

  return (
    <div
      style={{
        borderBottom: '1px solid var(--ow-line)',
        background: 'var(--ow-paper)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div className="container">
        <div
          ref={containerRef}
          style={{
            display: 'flex',
            gap: 'var(--space-7)',
            position: 'relative',
            overflowX: 'auto',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => onChange(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                padding: 'var(--space-4) 0',
                fontSize: '17px',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                color: active === tab.id ? 'var(--ow-navy)' : 'var(--ow-ink)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'color var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={(e) => {
                if (active !== tab.id) {
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--ow-navy)'
                }
              }}
              onMouseLeave={(e) => {
                if (active !== tab.id) {
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--ow-ink)'
                }
              }}
            >
              {tab.label}
            </button>
          ))}
          {/* Sliding active underline */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              height: '2px',
              background: 'var(--ow-navy)',
              transition: 'left 250ms var(--ease-out), width 250ms var(--ease-out)',
            }}
          />
        </div>
      </div>
    </div>
  )
}
