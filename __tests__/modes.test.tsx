// A mesma suíte nos três modos: app direto, estático e Cloudflare Workers.
import { beforeAll, describe, expect, it } from 'bun:test'
import path from 'node:path'
import { modes, page, type Mode } from '../testing'
import { staticApp, workerApp } from './fixtures/site/app'

const root = path.join(import.meta.dir, 'fixtures', 'site')

describe('mesma suíte nos três modos (site estático)', async () => {
  const all = await modes(staticApp, { root })
  for (const mode of all) {
    describe(mode.name, () => {
      it('páginas, post e feed', async () => {
        expect(await (await page(await mode.fetch('/'))).text('h1')).toBe('Início')
        expect(await (await page(await mode.fetch('/blog/segundo-post'))).text('p')).toBe('Outro <texto>')
        expect(await (await mode.fetch('/feed.xml')).text()).toBe('<rss>2</rss>')
      })
      it('404 para caminho inexistente', async () => {
        const res = await mode.fetch('/nao-existe')
        expect(res.status).toBe(404)
        expect(await res.text()).toContain('<h1>404</h1>')
      })
      it('arquivo de static/', async () => {
        expect(await (await mode.fetch('/robots.txt')).text()).toBe('User-agent: *\n')
      })
    })
  }
})

describe('rotas dinâmicas: app e Cloudflare respondem igual', () => {
  let all: Mode[]
  beforeAll(async () => { all = await modes(workerApp, { root, only: ['app', 'cloudflare'] }) })
  const post = (mode: Mode, email: string) =>
    mode.fetch('/contato', { method: 'POST', body: new URLSearchParams({ email }), headers: { origin: 'http://localhost' } })

  it('ação de formulário com fail() e sucesso', async () => {
    for (const mode of all) {
      expect((await post(mode, 'x')).status).toBe(400)
      expect(await (await page(await post(mode, 'a@b.c'))).text('p')).toBe('Recebido')
    }
  })
})
