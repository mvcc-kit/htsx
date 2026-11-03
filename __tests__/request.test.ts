// Regras puras de requisição e de resposta.
import { describe, expect, it } from 'bun:test'
import { canonicalPath, isCrossSiteForm, routePath, secureCookiesByDefault, wantsJsonOnly } from '../src/app/request'
import { mergeHeaders, withCookies, withSecurityHeaders } from '../src/app/response'

describe('canonicalPath', () => {
  it('never: tira a barra final', () => {
    expect(canonicalPath('/', 'never')).toBe('/')
    expect(canonicalPath('/a', 'never')).toBe('/a')
    expect(canonicalPath('/a/', 'never')).toBe('/a')
    expect(canonicalPath('/a///', 'never')).toBe('/a')
  })

  it('always: põe a barra, menos em arquivo', () => {
    expect(canonicalPath('/a', 'always')).toBe('/a/')
    expect(canonicalPath('/a/', 'always')).toBe('/a/')
    expect(canonicalPath('/a.xml', 'always')).toBe('/a.xml')
  })

  it('nunca aponta para outro site', () => {
    for (const mode of ['never', 'always'] as const) {
      for (const path of ['//evil.com/', '///evil.com/', '//evil.com']) {
        const out = canonicalPath(path, mode)
        if (out !== path) expect(out.startsWith('//')).toBe(false)
      }
    }
    expect(canonicalPath('//', 'never')).toBe('/')
  })

  it('routePath ignora a barra final', () => {
    expect(routePath('/a/')).toBe('/a')
    expect(routePath('/')).toBe('/')
  })
})

describe('isCrossSiteForm', () => {
  const base = { method: 'POST', contentType: 'application/x-www-form-urlencoded', origin: 'https://x.dev', self: 'https://x.dev', trusted: [] as string[] }

  it('mesma origem passa; outra, sem origem ou nula é barrada', () => {
    expect(isCrossSiteForm(base)).toBe(false)
    expect(isCrossSiteForm({ ...base, origin: 'https://evil.com' })).toBe(true)
    expect(isCrossSiteForm({ ...base, origin: null })).toBe(true)
    expect(isCrossSiteForm({ ...base, origin: 'null' })).toBe(true)
  })

  it('origem confiável passa', () => {
    expect(isCrossSiteForm({ ...base, origin: 'https://a.dev', trusted: ['https://a.dev'] })).toBe(false)
  })

  it('vale para qualquer tipo de formulário, sem tipo e em qualquer capitalização', () => {
    for (const contentType of ['multipart/form-data; boundary=x', 'text/plain', 'TEXT/PLAIN', 'Application/X-WWW-Form-Urlencoded', null, '']) {
      expect(isCrossSiteForm({ ...base, contentType, origin: 'https://evil.com' })).toBe(true)
    }
  })

  it('leitura e JSON não são formulário', () => {
    expect(isCrossSiteForm({ ...base, method: 'GET', origin: 'https://evil.com' })).toBe(false)
    expect(isCrossSiteForm({ ...base, contentType: 'application/json', origin: 'https://evil.com' })).toBe(false)
  })
})

it('cookie Secure, menos em http local', () => {
  expect(secureCookiesByDefault(new URL('https://x.dev'))).toBe(true)
  expect(secureCookiesByDefault(new URL('http://x.dev'))).toBe(true)
  expect(secureCookiesByDefault(new URL('http://localhost:3000'))).toBe(false)
  expect(secureCookiesByDefault(new URL('http://127.0.0.1'))).toBe(false)
})

it('wantsJsonOnly', () => {
  expect(wantsJsonOnly('application/json')).toBe(true)
  expect(wantsJsonOnly('text/html, application/json')).toBe(false)
  expect(wantsJsonOnly(null)).toBe(false)
})

describe('resposta imutável', () => {
  const frozen = () => { const r = Response.redirect('http://x/a', 302); return r }

  it('cabeçalhos e cookies entram com cópia, sem perder status', () => {
    const secured = withSecurityHeaders(frozen(), undefined)
    expect(secured.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(secured.status).toBe(302)
    expect(withCookies(frozen(), ['a=1']).headers.get('set-cookie')).toBe('a=1')
    expect(mergeHeaders(frozen(), new Headers({ 'x-a': '1' })).headers.get('x-a')).toBe('1')
  })

  it('sem nada a mudar, devolve a mesma resposta', () => {
    const res = new Response('x')
    expect(withCookies(res, [])).toBe(res)
    expect(mergeHeaders(res, new Headers())).toBe(res)
    expect(withSecurityHeaders(res, false)).toBe(res)
  })
})
