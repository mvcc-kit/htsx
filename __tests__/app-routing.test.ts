import { describe, expect, it } from 'bun:test'
import { compareRoutes, matchRoute, parseRouteId, resolveRoute, type ParamsOf } from '../src/app/routing'

const m = (id: string, path: string, matchers = {}) => matchRoute(parseRouteId(id), path, matchers)

describe('rotas no formato do SvelteKit', () => {
  it('fixa, parâmetro, opcional, rest e matcher', () => {
    expect(m('/', '/')).toEqual({})
    expect(m('/about', '/about')).toEqual({})
    expect(m('/about', '/about/x')).toBeNull()
    expect(m('/blog/[slug]', '/blog/ola%20mundo')).toEqual({ slug: 'ola mundo' })
    expect(m('/[[lang]]/about', '/about')).toEqual({})
    expect(m('/[[lang]]/about', '/pt/about')).toEqual({ lang: 'pt' })
    expect(m('/docs/[...path]', '/docs')).toEqual({ path: '' })
    expect(m('/docs/[...path]', '/docs/a/b')).toEqual({ path: 'a/b' })
    const int = { int: (v: string) => /^\d+$/.test(v) }
    expect(m('/item/[id=int]', '/item/42', int)).toEqual({ id: '42' })
    expect(m('/item/[id=int]', '/item/abc', int)).toBeNull()
  })

  it('segmento com acento casa com a URL codificada', () => {
    expect(m('/olá', new URL('http://x/olá').pathname)).toEqual({})
    expect(m('/olá/[x]', '/ol%C3%A1/%C3%A9')).toEqual({ x: 'é' })
  })

  it('URL malformada não casa', () => expect(m('/blog/[slug]', '/blog/%E0%A4%A')).toBeNull())

  it('id inválido dá erro com a correção', () => {
    expect(() => parseRouteId('sobre')).toThrow(/precisa começar com "\/"/)
    expect(() => parseRouteId('/about/')).toThrow(/não pode terminar com "\/"; use "\/about"/)
    expect(() => parseRouteId('/a-[x]')).toThrow(/mistura texto e parâmetro/)
    expect(() => parseRouteId('/[a]/[a]')).toThrow(/"a" repetido/)
    expect(() => parseRouteId('/[[...a]]')).toThrow(/opcional e rest/)
  })

  it('ordem: fixa > matcher > parâmetro > opcional > rest', () => {
    const ids = ['/[...rest]', '/[slug]', '/about', '/[id=int]', '/[[x]]']
    expect(ids.map(parseRouteId).sort(compareRoutes).map(r => r.id)).toEqual(['/about', '/[id=int]', '/[slug]', '/[[x]]', '/[...rest]'])
  })

  it('resolveRoute monta a URL a partir dos parâmetros', () => {
    expect(resolveRoute(parseRouteId('/blog/[slug]'), { slug: 'a b' })).toBe('/blog/a%20b')
    expect(resolveRoute(parseRouteId('/[[lang]]/about'), {})).toBe('/about')
    expect(resolveRoute(parseRouteId('/docs/[...p]'), { p: 'a/b c' })).toBe('/docs/a/b%20c')
    expect(() => resolveRoute(parseRouteId('/blog/[slug]'), {})).toThrow(/falta o parâmetro "slug"/)
  })

  it('tipos: ParamsOf extrai os parâmetros do id', () => {
    const p: ParamsOf<'/[[lang]]/blog/[slug]/[...rest]'> = { slug: 'a', rest: '' }
    const q: ParamsOf<'/item/[id=int]'> = { id: '1' }
    // @ts-expect-error — slug é obrigatório
    const r: ParamsOf<'/blog/[slug]'> = {}
    void [p, q, r]
    expect(true).toBe(true)
  })
})
