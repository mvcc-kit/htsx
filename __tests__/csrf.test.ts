import { describe, expect, it } from 'bun:test'
import { csrf, CsrfField } from '../src/csrf'
import { renderToString } from '../index'

const SECRET = 'a'.repeat(32) // exatos 32 chars (mínimo)
const STRONG = 'super-secret-key-with-at-least-32-chars-x' // ~40 chars

describe('csrf.sign', () => {
  it('gera token no formato sid.ts.sig', async () => {
    const t = await csrf.sign({ secret: SECRET, sessionId: 'u1' })
    const parts = t.split('.')
    expect(parts).toHaveLength(3)
  })

  it('throw se secret < 32 chars', async () => {
    await expect(csrf.sign({ secret: 'short', sessionId: 'u1' }))
      .rejects.toThrow(/32 chars/)
  })

  it('throw se sessionId vazio', async () => {
    await expect(csrf.sign({ secret: SECRET, sessionId: '' }))
      .rejects.toThrow(/sessionId/)
  })

  it('tokens sucessivos têm timestamp atualizado', async () => {
    const a = await csrf.sign({ secret: SECRET, sessionId: 'u1' })
    await new Promise(r => setTimeout(r, 1100))
    const b = await csrf.sign({ secret: SECRET, sessionId: 'u1' })
    expect(a).not.toBe(b)
  })

  it('tokens com sessions diferentes são diferentes', async () => {
    const a = await csrf.sign({ secret: SECRET, sessionId: 'u1' })
    const b = await csrf.sign({ secret: SECRET, sessionId: 'u2' })
    expect(a).not.toBe(b)
  })
})

describe('csrf.verify: happy path', () => {
  it('verify token recém-assinado retorna true', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u1' })).toBe(true)
  })

  it('verify várias vezes ainda válido (mesmo maxAge)', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u1' })).toBe(true)
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u1' })).toBe(true)
  })
})

describe('csrf.verify: rejeição', () => {
  it('false quando sessionId diferente', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u2' })).toBe(false)
  })

  it('false quando secret diferente', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    const other = 'different-secret-with-at-least-32-chars-yy'
    expect(await csrf.verify(t, { secret: other, sessionId: 'u1' })).toBe(false)
  })

  it('false quando assinatura modificada', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    const tampered = t.slice(0, -2) + 'XX'
    expect(await csrf.verify(tampered, { secret: STRONG, sessionId: 'u1' })).toBe(false)
  })

  it('false quando token expirado (maxAge ultrapassado)', async () => {
    // monta token "do passado" manualmente
    const oldTs = Math.floor(Date.now() / 1000) - 7200 // 2h atrás
    const sid = b64UrlEnc('u1')
    const payload = `${sid}.${oldTs}`
    // assinatura correta pro payload antigo
    const sig = await hmacSha256(STRONG, payload)
    const expired = `${payload}.${sig}`
    expect(await csrf.verify(expired, { secret: STRONG, sessionId: 'u1', maxAge: 3600 }))
      .toBe(false)
  })

  it('false quando timestamp no futuro (replay/clock attack)', async () => {
    const futureTs = Math.floor(Date.now() / 1000) + 600
    const sid = b64UrlEnc('u1')
    const payload = `${sid}.${futureTs}`
    const sig = await hmacSha256(STRONG, payload)
    const future = `${payload}.${sig}`
    expect(await csrf.verify(future, { secret: STRONG, sessionId: 'u1' })).toBe(false)
  })

  it('false em formato malformado (sem throw)', async () => {
    expect(await csrf.verify('notatoken', { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify('a.b', { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify('a.b.c.d', { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify('', { secret: STRONG, sessionId: 'u1' })).toBe(false)
  })

  it('false em entrada null/undefined/number', async () => {
    expect(await csrf.verify(null, { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify(undefined, { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify(123, { secret: STRONG, sessionId: 'u1' })).toBe(false)
    expect(await csrf.verify({}, { secret: STRONG, sessionId: 'u1' })).toBe(false)
  })

  it('false em timestamp não-numérico', async () => {
    const sig = await hmacSha256(STRONG, 'u1.abc')
    expect(await csrf.verify(`u1.abc.${sig}`, { secret: STRONG, sessionId: 'u1' }))
      .toBe(false)
  })

  it('false se secret na verify < 32 chars', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    expect(await csrf.verify(t, { secret: 'short', sessionId: 'u1' })).toBe(false)
  })
})

describe('csrf: timing-safe compare (statistical)', () => {
  it('verify de tokens de mesmo tamanho não vaza timing significativo', async () => {
    const valid = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    const invalid = valid.slice(0, -1) + 'X' // mesmo length, sig diferente
    // medir múltiplas runs e ver que tempos são comparáveis (não scientific,
    // mas pega regressão óbvia tipo `return a === b` curto-circuito)
    const N = 200
    const tValid: number[] = []
    const tInvalid: number[] = []
    for (let i = 0; i < N; i++) {
      const s = performance.now()
      await csrf.verify(valid, { secret: STRONG, sessionId: 'u1' })
      tValid.push(performance.now() - s)
    }
    for (let i = 0; i < N; i++) {
      const s = performance.now()
      await csrf.verify(invalid, { secret: STRONG, sessionId: 'u1' })
      tInvalid.push(performance.now() - s)
    }
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    // diferença média < 50% — heurística frouxa pra não flakar em CI
    const ratio = Math.abs(avg(tValid) - avg(tInvalid)) /
                  Math.max(avg(tValid), avg(tInvalid))
    expect(ratio).toBeLessThan(0.5)
  })
})

describe('csrf: maxAge customizado', () => {
  it('maxAge curto rejeita token velho', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    await new Promise(r => setTimeout(r, 2200))
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u1', maxAge: 1 }))
      .toBe(false)
  })

  it('maxAge longo aceita token recente', async () => {
    const t = await csrf.sign({ secret: STRONG, sessionId: 'u1' })
    expect(await csrf.verify(t, { secret: STRONG, sessionId: 'u1', maxAge: 86400 }))
      .toBe(true)
  })
})

describe('CsrfField (JSX)', () => {
  it('gera input hidden com value escapado', async () => {
    const html = await renderToString(() =>
      CsrfField({ token: 'abc"<>def', name: '_csrf' }),
    )
    expect(html).toBe('<input type="hidden" name="_csrf" value="abc&quot;&lt;&gt;def">')
  })

  it('name customizado', async () => {
    const html = await renderToString(() =>
      CsrfField({ token: 'tok', name: 'csrf_token' }),
    )
    expect(html).toContain('name="csrf_token"')
  })
})

function b64UrlEnc(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// helper local pra testes que precisam construir tokens manualmente
async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(data))
  const bytes = new Uint8Array(s)
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
