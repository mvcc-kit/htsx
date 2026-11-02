import { describe, expect, it } from 'bun:test'
import { measure } from '../scripts/size'

describe('teto de tamanho (size-limit.json)', async () => {
  for (const s of await measure()) {
    it(`${s.entry}: ${s.bytes} bytes ≤ ${s.limit.maxBytes}`, () => {
      if (s.bytes > s.limit.maxBytes) {
        throw new Error(`${s.entry} tem ${s.bytes} bytes minificado, acima do teto de ${s.limit.maxBytes}. Reduza, ou suba maxBytes em size-limit.json e explique em "motivo".`)
      }
      expect(s.limit.motivo.length).toBeGreaterThan(10)
    })
  }
})
