import React, { useState, useRef, useCallback } from 'react'
import type { IngestResult, AnalysisParams } from '../engine/types'
import type { WorkerResponse } from '../worker/ingest.worker'

interface Props {
  onIngestDone: (result: IngestResult) => void
  params: AnalysisParams
}

type FileState = { name: string; buffer: ArrayBuffer } | null

type Status = 'idle' | 'loading' | 'error'

export default function ToolTab({ onIngestDone }: Props) {
  const [contracts, setContracts] = useState<FileState>(null)
  const [claims, setClaims]       = useState<FileState>(null)
  const [status, setStatus]       = useState<Status>('idle')
  const [progress, setProgress]   = useState<string>('')
  const [errorMsg, setErrorMsg]   = useState<string>('')
  const workerRef = useRef<Worker | null>(null)

  const loadFile = useCallback(
    (file: File, setter: (s: FileState) => void) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        setter({ name: file.name, buffer: e.target!.result as ArrayBuffer })
      }
      reader.readAsArrayBuffer(file)
    },
    []
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, setter: (s: FileState) => void) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) loadFile(file, setter)
    },
    [loadFile]
  )

  const runAnalysis = useCallback(() => {
    if (!contracts || !claims) return
    setStatus('loading')
    setErrorMsg('')
    setProgress('Starting…')

    if (workerRef.current) workerRef.current.terminate()
    const worker = new Worker(
      new URL('../worker/ingest.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress(msg.message ?? '')
      } else if (msg.type === 'done' && msg.result) {
        setStatus('idle')
        worker.terminate()
        onIngestDone(msg.result)
      } else if (msg.type === 'error') {
        setStatus('error')
        setErrorMsg(msg.error ?? 'Unknown error')
        worker.terminate()
      }
    }

    worker.postMessage(
      {
        contractsBuffer: contracts.buffer,
        claimsBuffer: claims.buffer,
        evalDate: '2025-01-31',
      },
      [contracts.buffer, claims.buffer]
    )
  }, [contracts, claims, onIngestDone])

  return (
    <div className="container" style={{ padding: 'var(--space-9) var(--space-7)' }}>
      <p className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>
        Rate Adequacy Analysis
      </p>
      <h2 style={{ marginBottom: 'var(--space-4)', maxWidth: '600px', lineHeight: 1.1 }}>
        Drop your data files to begin
      </h2>
      <p style={{ color: 'var(--ow-mute)', marginBottom: 'var(--space-8)', maxWidth: '520px', fontSize: '16px' }}>
        The analysis runs entirely in your browser. No data is uploaded.
        Drop an XLSX or CSV for each file below, then run the analysis.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', maxWidth: '800px', marginBottom: 'var(--space-7)' }}>
        <DropZone
          label="Contracts file"
          hint="ContractID, WrittenPremium, dates…"
          file={contracts}
          onDrop={(e) => handleDrop(e, setContracts)}
          onChange={(f) => loadFile(f, setContracts)}
        />
        <DropZone
          label="Claims file"
          hint="Contract_ID, Total_Claim_Cost_in_USD…"
          file={claims}
          onDrop={(e) => handleDrop(e, setClaims)}
          onChange={(f) => loadFile(f, setClaims)}
        />
      </div>

      {status === 'loading' && (
        <div style={{ marginBottom: 'var(--space-5)', maxWidth: '800px' }}>
          <div className="progress-bar" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="progress-bar-fill" style={{ width: '60%' }} />
          </div>
          <p style={{ fontSize: '14px', color: 'var(--ow-mute)' }}>{progress}</p>
        </div>
      )}

      {status === 'error' && (
        <p style={{ fontSize: '14px', color: 'var(--ow-chart-neg)', marginBottom: 'var(--space-5)' }}>
          {errorMsg}
        </p>
      )}

      <button
        className="btn-primary"
        disabled={!contracts || !claims || status === 'loading'}
        onClick={runAnalysis}
      >
        {status === 'loading' ? 'Analyzing…' : 'Run analysis →'}
      </button>

      <div className="divider" style={{ maxWidth: '800px' }} />

      <div style={{ maxWidth: '520px' }}>
        <p className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>Expected columns</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-5)' }}>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Contracts</p>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ow-mute)', lineHeight: 2 }}>
              {['ContractID','ContractSaleDate','ContractEffectiveDate','ContractExpirationDate','ContractDuration','ContractCancellationDate','WrittenPremium','RefundPremium','ProductType','OEMWarrantyTerm'].join('\n')}
            </code>
          </div>
          <div>
            <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>Claims</p>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ow-mute)', lineHeight: 2 }}>
              {['Contract_ID','Transaction_Date','Claim_ID','Total_Claim_Cost_in_USD','Coverage','Resolution_Type'].join('\n')}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DropZoneProps {
  label: string
  hint: string
  file: FileState
  onDrop: (e: React.DragEvent) => void
  onChange: (f: File) => void
}

function DropZone({ label, hint, file, onDrop, onChange }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <p style={{ fontSize: '14px', fontWeight: 600, marginBottom: 'var(--space-3)', color: 'var(--ow-ink)' }}>
        {label}
      </p>
      <div
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDrop={(e) => { setDragOver(false); onDrop(e) }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        style={{ minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
      >
        {file ? (
          <>
            <span style={{ fontSize: '22px' }}>✓</span>
            <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--ow-navy)' }}>{file.name}</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: '14px', color: 'var(--ow-mute)' }}>Drop file or click to browse</p>
            <p style={{ fontSize: '12px', color: 'var(--ow-mute)' }}>{hint}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv,.xls"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f) }}
        />
      </div>
    </div>
  )
}
