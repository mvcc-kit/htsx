import { describe, expect, it } from 'bun:test'
import { flash, type FlashMessage } from '../src/flash'

const SECRET = 'a-flash-secret-key-with-32-chars-yyy'

describe('flash.serialize + parse: round-trip', () => {
  it('serializa e re-parseia mensagens idênticas', async () => {
    const msgs: FlashMessage[] = [
      { type: 'success', text: 'Salvo!' },
      { type: 'error', text: 'Erro X' },
    ]
    const token = await flash.serialize(msgs, { secret: SECRET })
    const parsed = await flash.parse(token, { secret: SECRET })
    expect(parsed).toEqual(msgs)
  })

  it('preserva meta', async () => {
    const msgs: FlashMessage[] = [{
      type: 'info',
      text: 'Hello',
      meta: { count: 5, items: [1, 2, 3] },
    }]
    const token = await flash.serialize(msgs, { secret: SECRET })
    const parsed = await flash.parse(token, { secret: SECRET })
    expect(parsed[0]?.meta).toEqual({ count: 5, items: [1, 2, 3] })
  })

  it('array vazio funciona', async () => {
    const token = await flash.serialize([], { secret: SECRET })
    expect(await flash.parse(token, { secret: SECRET })).toEqual([])
  })
})

describe('flash: rejeição de tamper', () => {
  it('signature trocada → []', async () => {
    const token = await flash.serialize(
      [{ type: 'success', text: 'ok' }],
      { secret: SECRET },
    )
    const tampered = token.slice(0, -3) + 'XXX'
    expect(await flash.parse(tampered, { secret: SECRET })).toEqual([])
  })

  it('payload alterado → []', async () => {
    const token = await flash.serialize(
      [{ type: 'success', text: 'ok' }],
      { secret: SECRET },
    )
    const [, sig] = token.split('.')
    const fake = `${btoa('[{"type":"error","text":"hacked"}]').replace(/=+$/, '')}.${sig}`
    expect(await flash.parse(fake, { secret: SECRET })).toEqual([])
  })

  it('secret diferente na parse → []', async () => {
    const token = await flash.serialize(
      [{ type: 'success', text: 'ok' }],
      { secret: SECRET },
    )
    const other = 'different-secret-with-at-least-32-chars'
    expect(await flash.parse(token, { secret: other })).toEqual([])
  })
})

describe('flash: validação', () => {
  it('throw se secret < 32 chars na serialize', async () => {
    await expect(
      flash.serialize([], { secret: 'short' }),
    ).rejects.toThrow(/32 chars/)
  })

  it('parse retorna [] com secret curto (silencioso)', async () => {
    expect(await flash.parse('x.y', { secret: 'short' })).toEqual([])
  })

  it('filtra mensagens inválidas (type não-reconhecido)', async () => {
    // serialize só aceita tipos válidos via filter → mensagens malformadas somem
    const result = await flash.serialize(
      // @ts-expect-error — testando filter
      [{ type: 'lol', text: 'x' }, { type: 'success', text: 'ok' }],
      { secret: SECRET },
    )
    const parsed = await flash.parse(result, { secret: SECRET })
    expect(parsed).toEqual([{ type: 'success', text: 'ok' }])
  })

  it('filtra na parse (defesa adicional)', async () => {
    // payload manual com type inválido — assinatura correta
    const payload = btoa(JSON.stringify({ t: Math.floor(Date.now() / 1000), m: [
      { type: 'success', text: 'ok' },
      { type: 'INVALID', text: 'x' },
      { text: 'sem type' },
    ] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`flash:${payload}`))
    const bytes = new Uint8Array(sig)
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
    const sigB64 = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const parsed = await flash.parse(`${payload}.${sigB64}`, { secret: SECRET })
    expect(parsed).toEqual([{ type: 'success', text: 'ok' }])
  })

  it('parse de entrada malformada retorna []', async () => {
    expect(await flash.parse('', { secret: SECRET })).toEqual([])
    expect(await flash.parse('no.dots', { secret: SECRET })).toEqual([])
    expect(await flash.parse('a.b.c', { secret: SECRET })).toEqual([])
    expect(await flash.parse(null, { secret: SECRET })).toEqual([])
    expect(await flash.parse(123 as never, { secret: SECRET })).toEqual([])
  })
})

describe('flash.setCookie / clearCookie', () => {
  it('setCookie defaults seguros', () => {
    const c = flash.setCookie('value')
    expect(c).toContain('_flash=value')
    expect(c).toContain('Path=/')
    expect(c).toContain('Max-Age=120')
    expect(c).toContain('HttpOnly')
    expect(c).toContain('SameSite=Strict')
    expect(c).toContain('Secure')
  })

  it('setCookie permite override', () => {
    const c = flash.setCookie('v', {
      name: 'flash2',
      maxAge: 300,
      path: '/app',
      sameSite: 'Lax',
      secure: false,
      domain: 'example.com',
    })
    expect(c).toContain('flash2=v')
    expect(c).toContain('Max-Age=300')
    expect(c).toContain('Path=/app')
    expect(c).toContain('SameSite=Lax')
    expect(c).not.toContain('Secure')
    expect(c).toContain('Domain=example.com')
  })

  it('clearCookie usa Max-Age=0', () => {
    const c = flash.clearCookie()
    expect(c).toContain('_flash=')
    expect(c).toContain('Max-Age=0')
  })
})

describe('flash.readCookie', () => {
  it('lê de Request', () => {
    const r = new Request('http://x', {
      headers: { cookie: '_flash=abc123; other=x' },
    })
    expect(flash.readCookie(r)).toBe('abc123')
  })

  it('retorna null se cookie ausente', () => {
    const r = new Request('http://x')
    expect(flash.readCookie(r)).toBeNull()
  })

  it('lê de Headers diretamente', () => {
    const h = new Headers({ cookie: '_flash=xyz' })
    expect(flash.readCookie(h)).toBe('xyz')
  })

  it('nome custom', () => {
    const h = new Headers({ cookie: 'custom=value123' })
    expect(flash.readCookie(h, 'custom')).toBe('value123')
  })
})

describe('flash: round-trip realista via cookie', () => {
  it('serialize → setCookie → readCookie → parse', async () => {
    const msgs: FlashMessage[] = [{ type: 'success', text: 'Conta criada' }]
    const token = await flash.serialize(msgs, { secret: SECRET })
    const cookieValue = flash.setCookie(token)

    // simula browser enviando o cookie de volta
    const req = new Request('http://x', {
      headers: { cookie: cookieValue.split(';')[0]! },
    })
    const read = flash.readCookie(req)
    expect(read).toBe(token)
    const parsed = await flash.parse(read, { secret: SECRET })
    expect(parsed).toEqual(msgs)
  })
})
