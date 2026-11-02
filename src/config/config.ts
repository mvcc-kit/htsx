// htsx.config.ts: a configuração do projeto, no lugar de uma CLI (como o svelte.config do SvelteKit).
// Rodar o próprio arquivo executa os comandos: `bun htsx.config.ts dev | build | start | sync`.
// Este módulo é leve: o código de build só é carregado (import dinâmico) quando o arquivo é executado.
import type { AppOptions } from '../app/app'

export interface StaticAdapter {
  name: 'static'
  /** Pasta de saída. Padrão `build`. */
  outDir?: string
  /** Página de "não encontrado". Padrão `404.html`; `false` desliga. */
  fallback?: string | false
  /** `false` aceita rotas dinâmicas (ficam de fora). Padrão `true`. */
  strict?: boolean
}

export interface CloudflareAdapter {
  name: 'cloudflare'
  /** Pasta de Static Assets e do `_worker.js`. Padrão `.htsx/cloudflare`. */
  outDir?: string
  /** Arquivo do wrangler a conferir. Padrão `wrangler.jsonc`/`wrangler.json`; `false` pula. */
  wrangler?: string | false
  /** Binding dos assets (`assets.binding`). Padrão `ASSETS`. */
  assetsBinding?: string
  /**
   * Módulo opcional juntado ao Worker gerado: exports nomeados (Durable Objects, Workflows)
   * e `export default { scheduled, queue, email }`. Padrão `src/worker.ts` (se existir).
   */
  worker?: string
  /** `env` usado no `dev` (vars e bindings simulados); bindings reais: `wrangler dev` no build. */
  devEnv?: Record<string, unknown>
}

export interface BunAdapter {
  name: 'bun'
  port?: number
  hostname?: string
}

export type Adapter = StaticAdapter | CloudflareAdapter | BunAdapter

/** Opções do app que valem no build e no runtime (serializáveis; funções vão em hooks.server.ts). */
export type ConfigAppOptions = Pick<AppOptions, 'trailingSlash' | 'csrf' | 'prerender'>

export interface HtsxConfig {
  adapter: Adapter
  /** Pasta das rotas por arquivos. Padrão `src/routes`. */
  routes?: string
  /** Matchers (`<nome>.ts` com `export function match`). Padrão `src/params`. */
  params?: string
  /** `handle`, `handleError` e `context`. Padrão `src/hooks.server.ts` (se existir). */
  hooks?: string
  /** Arquivos estáticos servidos como estão. Padrão `static`. */
  assets?: string
  /** Pasta gerada (manifesto e tipos `./$types`). Padrão `.htsx`. */
  out?: string
  /** Nome do pacote nos arquivos gerados. Padrão `@repo/htsx`. */
  pkg?: string
  /** Opções do app (`app` não serve como nome: o Bun trata `default.app` como servidor e sobe um sozinho). */
  options?: ConfigAppOptions
}

/** Modo estático: o site todo vira HTML no build. */
export const staticAdapter = (opts: Omit<StaticAdapter, 'name'> = {}): StaticAdapter => ({ name: 'static', ...opts })
/** Modo Cloudflare Workers: Static Assets + Worker (D1, R2, KV, Durable Objects... via `event.platform.env`). */
export const cloudflareAdapter = (opts: Omit<CloudflareAdapter, 'name'> = {}): CloudflareAdapter => ({ name: 'cloudflare', ...opts })
/** Modo servidor Bun: `Bun.serve` com as rotas, `static/` e o vendor. */
export const bunAdapter = (opts: Omit<BunAdapter, 'name'> = {}): BunAdapter => ({ name: 'bun', ...opts })

const COMMANDS = ['dev', 'build', 'start', 'sync'] as const
export type Command = (typeof COMMANDS)[number]

function isConfigMain(): boolean {
  const main = (globalThis as { Bun?: { main?: string } }).Bun?.main
  return !!main && /(^|[\\/])htsx\.config\.[cm]?[jt]s$/.test(main)
}

/**
 * Declara a configuração. Executado como arquivo principal (`bun htsx.config.ts build`),
 * roda o comando pedido; importado, só devolve a configuração.
 */
export function defineConfig<const C extends HtsxConfig>(config: C): C {
  if (isConfigMain()) {
    const g = globalThis as { Bun: { main: string }; process: { argv: string[]; exitCode?: number } }
    const cmd = g.process.argv[2] ?? 'dev'
    if (!COMMANDS.includes(cmd as Command)) {
      console.error(`htsx: comando "${cmd}" não existe; use bun htsx.config.ts ${COMMANDS.join(' | ')}`)
      g.process.exitCode = 1
    } else {
      const root = g.Bun.main.replace(/[\\/][^\\/]+$/, '')
      // import dinâmico: o código de build não pesa em quem só importa a configuração
      void import('../build/commands').then(m => m.run(cmd as Command, config, root)).catch(err => {
        console.error(err instanceof Error ? err.message : err)
        g.process.exitCode = 1
      })
    }
  }
  return config
}
