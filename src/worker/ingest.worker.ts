import { ingest } from '../engine/ingest'
import type { AnalysisParams, IngestResult } from '../engine/types'

export interface WorkerRequest {
  contractsBuffer: ArrayBuffer
  claimsBuffer: ArrayBuffer
  evalDate: string // ISO string
}

export interface WorkerResponse {
  type: 'progress' | 'done' | 'error'
  message?: string
  result?: IngestResult
  error?: string
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const { contractsBuffer, claimsBuffer, evalDate } = e.data

    postMessage({ type: 'progress', message: 'Parsing files…' } as WorkerResponse)

    const result = ingest(
      contractsBuffer,
      claimsBuffer,
      new Date(evalDate)
    )

    postMessage({ type: 'done', result } as WorkerResponse)
  } catch (err) {
    postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    } as WorkerResponse)
  }
}
