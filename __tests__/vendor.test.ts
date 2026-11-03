import { describe, expect, it } from 'bun:test'
import path from 'node:path'
import pins from '../vendor/pins.json'
import { head } from '../src/head'
import { withoutStrictMode } from './setup'

const VENDOR = path.join(import.meta.dir, '..', 'vendor')

describe('vendor/: cópias próprias de Alpine e htmx (falha 6)', () => {
  for (const [name, pin] of Object.entries(pins)) {
    it(`${name}: sha256 confere com pins.json (${pin.package}@${pin.version})`, async () => {
      const bytes = await Bun.file(path.join(VENDOR, pin.file)).arrayBuffer()
      expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(pin.sha256)
    })
  }

  it('versões fixadas são exatas, sem faixa', () => {
    for (const pin of Object.values(pins)) expect(pin.version).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

describe('head(): vendor local e integrity no CDN', () => {
  const sri = (hex: string) => 'sha256-' + Buffer.from(hex, 'hex').toString('base64')

  it('CDN usa a versão fixada e emite integrity + crossorigin', () => {
    const h = head({ alpine: { plugins: ['mask'] }, htmx: true })
    expect(h).toContain(`<script defer src="https://cdn.jsdelivr.net/npm/@alpinejs/mask@${pins['alpine-mask'].version}/dist/cdn.min.js" integrity="${sri(pins['alpine-mask'].sha256)}" crossorigin="anonymous"></script>`)
    expect(h).toContain(`<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@${pins.alpine.version}/dist/cdn.min.js" integrity="${sri(pins.alpine.sha256)}" crossorigin="anonymous"></script>`)
    expect(h).toContain(`<script src="https://unpkg.com/htmx.org@${pins.htmx.version}/dist/htmx.min.js" integrity="${sri(pins.htmx.sha256)}" crossorigin="anonymous"></script>`)
  })

  it('vendor: caminho local, sem CDN', () => {
    const h = head({ alpine: { plugins: ['collapse'] }, htmx: true, vendor: '/static/vendor/', nonce: 'n' })
    expect(h).toContain('<script defer src="/static/vendor/alpine-collapse.min.js" nonce="n"></script>')
    expect(h).toContain('<script defer src="/static/vendor/alpine.min.js" nonce="n"></script>')
    expect(h).toContain('<script src="/static/vendor/htmx.min.js" nonce="n"></script>')
    expect(h).not.toContain('https://')
  })

  it('versão fora da fixada → erro no modo estrito', () =>
    expect(() => head({ htmx: { version: '2.0.0' } })).toThrow(/htsx: htmx.org@2.0.0 vem de CDN sem integrity/))

  describe('fora do modo estrito', () => {
    withoutStrictMode()
    it('versão fora da fixada sai sem integrity', () => {
      expect(head({ htmx: { version: '2.0.0' } })).toContain('<script src="https://unpkg.com/htmx.org@2.0.0/dist/htmx.min.js"></script>')
    })
  })
})
