import React from 'react'

const GITHUB_URL = 'https://github.com/marshalldeese/OW-rate-analyzer-DEMO'

export default function Header() {
  return (
    <div
      style={{
        borderBottom: '1px solid var(--ow-line)',
        background: 'var(--ow-paper)',
      }}
    >
      <div
        className="container"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-7)',
          height: '52px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--ow-navy)',
          }}
        >
          MA5 Rate Adequacy Analyzer
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '14px',
            color: 'var(--ow-navy)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          onMouseEnter={(e) =>
            ((e.target as HTMLElement).style.textDecoration = 'underline')
          }
          onMouseLeave={(e) =>
            ((e.target as HTMLElement).style.textDecoration = 'none')
          }
        >
          View on GitHub →
        </a>
      </div>
    </div>
  )
}
