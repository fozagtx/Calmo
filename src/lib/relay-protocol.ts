export const FRAME_HEADER_BYTES = 16

export type RelayClientMessage = { type: 'start' } | { type: 'stop' } | { type: 'reset' }

export type RelayServerMessage =
  | { type: 'ack'; op: 'start' | 'stop' | 'reset'; ok: true }
  | { type: 'ack'; op: 'start' | 'stop' | 'reset'; ok: false; code: number; message: string; retryable: boolean }
  | { type: 'status'; code: number }
  | { type: 'validation'; code: number; hint: string }
  | { type: 'error'; code: number; message: string; retryable: boolean }
