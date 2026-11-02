// Sync das rotas (htsx.config.ts sync|dev|build): lê src/routes/ e gera (1) `.htsx/routes.ts`, o manifesto com imports estáticos
// (o Worker não lê pastas), e (2) `.htsx/types/**/$types.d.ts`, os tipos de cada pasta,
// como o `.svelte-kit/types` do SvelteKit. Só build (usa node:fs).
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseRouteId } from '../app/routing'

const KINDS = ['+page', '+page.server', '+layout', '+layout.server', '+server', '+error'] as const
type Kind = (typeof KINDS)[number]
export const EXTS = ['.tsx', '.ts', '.jsx', '.js']

const HINTS: Record<string, string> = {
  '+page.svelte': 'use +page.tsx',
  '+layout.svelte': 'use +layout.tsx',
  '+error.svelte': 'use +error.tsx',
}

export interface ScannedDir {
  /** Pasta relativa à raiz do projeto, com `/` (ex.: `src/routes/(site)/blog`). */
  dir: string
  /** Id da rota desta pasta, sem grupos (ex.: `/blog`). */
  id: string
  files: Partial<Record<Kind, string>>
  parent: ScannedDir | null
}

export interface SyncOptions {
  /** Raiz do projeto. Padrão: diretório atual. */
  root?: string
  /** Pasta das rotas. Padrão `src/routes`. */
  routes?: string
  /** Pasta dos matchers (`<nome>.ts` com `export function match`). Padrão `src/params`. */
  params?: string
  /** Pasta gerada. Padrão `.htsx`. */
  out?: string
  /** Nome do pacote nos imports gerados. Padrão `@repo/htsx`. */
  pkg?: string
}

export interface SyncResult {
  manifest: string
  routes: string[]
  dirs: ScannedDir[]
}

const posix = (p: string) => p.split(path.sep).join('/')

/** Lê a árvore de rotas e valida os nomes de arquivo. */
export async function scanRoutes(root: string, routesDir: string): Promise<ScannedDir[]> {
  const abs = path.resolve(root, routesDir)
  try { if (!(await stat(abs)).isDirectory()) throw 0 } catch { throw new Error(`htsx: pasta de rotas ${posix(path.relative(root, abs))} não existe`) }
  const out: ScannedDir[] = []
  const problems: string[] = []

  async function walk(dirAbs: string, segments: string[], parent: ScannedDir | null) {
    const rel = posix(path.relative(root, dirAbs))
    const node: ScannedDir = { dir: rel, id: '/' + segments.join('/'), files: {}, parent }
    const entries = (await readdir(dirAbs, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (!e.isFile() || !e.name.startsWith('+')) continue
      const ext = EXTS.find(x => e.name.endsWith(x))
      const kind = ext ? e.name.slice(0, -ext.length) : e.name
      if (!ext || !KINDS.includes(kind as Kind)) {
        problems.push(`${rel}/${e.name}: ${HINTS[e.name] ?? `nome desconhecido; use ${KINDS.map(k => k + '.tsx|.ts').join(', ')}`}`)
        continue
      }
      if (node.files[kind as Kind]) problems.push(`${rel}: ${kind} aparece duas vezes (${path.basename(node.files[kind as Kind]!)} e ${e.name})`)
      node.files[kind as Kind] = `${rel}/${e.name}`
    }
    out.push(node)
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue
      const isGroup = /^\(.+\)$/.test(e.name)
      await walk(path.join(dirAbs, e.name), isGroup ? segments : [...segments, e.name], node)
    }
  }
  await walk(abs, [], null)
  // checagens que o manifesto também faz, mas aqui com a pasta e já no sync
  const byId = new Map<string, string[]>()
  for (const d of out) {
    const isRoute = d.files['+page'] || d.files['+server'] || d.files['+page.server']
    if (!isRoute) continue
    try { parseRouteId(d.id) } catch (e) { problems.push(`${d.dir}: ${(e as Error).message.replace(/^htsx: /, '')}`) }
    if (d.files['+page.server'] && !d.files['+page']) problems.push(`${d.dir}: +page.server.ts sem +page.tsx; crie a página ou troque por +server.ts`)
    byId.set(d.id, [...(byId.get(d.id) ?? []), d.dir])
  }
  for (const [id, where] of byId) {
    if (where.length > 1) problems.push(`a rota "${id}" aparece em mais de uma pasta (${where.join(', ')}); grupos (nome) não mudam a URL`)
  }
  if (problems.length) throw new Error(`htsx: arquivos de rota inválidos:\n${problems.map(p => `  - ${p}`).join('\n')}`)
  return out
}

function chain(d: ScannedDir): ScannedDir[] {
  const c: ScannedDir[] = []
  for (let n: ScannedDir | null = d; n; n = n.parent) c.unshift(n)
  return c
}

const stripExt = (f: string) => f.replace(/\.(tsx|ts|jsx|js)$/, '')

/** Gera `.htsx/routes.ts`, `.htsx/types/**\/$types.d.ts` e `.htsx/tsconfig.json`. */
export async function syncRoutes(opts: SyncOptions = {}): Promise<SyncResult> {
  const root = path.resolve(opts.root ?? '.')
  const routesDir = opts.routes ?? 'src/routes'
  const out = path.resolve(root, opts.out ?? '.htsx')
  const pkg = opts.pkg ?? '@repo/htsx'
  const dirs = await scanRoutes(root, routesDir)

  // ── manifesto ──
  const imports: string[] = []
  const ids = new Map<string, string>()
  const mod = (file: string | undefined) => {
    if (!file) return undefined
    if (!ids.has(file)) {
      const name = `m${ids.size}`
      ids.set(file, name)
      imports.push(`import * as ${name} from ${JSON.stringify(posix(path.relative(out, path.join(root, stripExt(file)))).replace(/^(?!\.)/, './'))}`)
    }
    return ids.get(file)
  }
  const level = (d: ScannedDir) => {
    const parts = [`dir: ${JSON.stringify(d.dir)}`]
    const add = (k: string, f?: string) => { const m = mod(f); if (m) parts.push(`${k}: ${m}`) }
    add('layout', d.files['+layout']); add('layoutServer', d.files['+layout.server']); add('error', d.files['+error'])
    return `{ ${parts.join(', ')} }`
  }
  const routeEntries: string[] = []
  for (const d of dirs) {
    if (!d.files['+page'] && !d.files['+server'] && !d.files['+page.server']) continue
    const parts = [`id: ${JSON.stringify(d.id)}`, `levels: [${chain(d).map(level).join(', ')}]`]
    const add = (k: string, f?: string) => { const m = mod(f); if (m) parts.push(`${k}: ${m}`) }
    add('page', d.files['+page']); add('pageServer', d.files['+page.server']); add('endpoint', d.files['+server'])
    routeEntries.push(`    { ${parts.join(', ')} },`)
  }
  if (!routeEntries.length && !dirs.some(d => d.files['+error'])) {
    throw new Error(`htsx: nenhuma rota em ${routesDir}; crie ${routesDir}/+page.tsx`)
  }

  const paramsDir = path.resolve(root, opts.params ?? 'src/params')
  const paramEntries: string[] = []
  try {
    for (const f of (await readdir(paramsDir)).sort()) {
      const ext = EXTS.find(x => f.endsWith(x))
      if (!ext || f.includes('.test.') || f.includes('.spec.')) continue
      const name = f.slice(0, -ext.length)
      if (!/^[a-zA-Z_]\w*$/.test(name)) throw new Error(`htsx: matcher ${posix(path.relative(root, path.join(paramsDir, f)))}: o nome vira [x=${name}]; use letras, números e _`)
      paramEntries.push(`    ${name}: ${mod(posix(path.relative(root, path.join(paramsDir, f))))},`)
    }
  } catch (e) { if ((e as { code?: string }).code !== 'ENOENT') throw e }

  const rootLevel = level(dirs[0]!)   // antes de juntar os imports, para incluir os da raiz
  const manifest = [
    '// Gerado pelo htsx (htsx.config.ts) a partir de ' + routesDir + '. Não edite.',
    `import { fileRoutes } from ${JSON.stringify(pkg + '/app')}`,
    ...imports,
    '',
    'export const files = fileRoutes({',
    `  root: ${rootLevel},`,
    '  routes: [',
    ...routeEntries,
    '  ],',
    `  params: {${paramEntries.length ? '\n' + paramEntries.join('\n') + '\n  ' : ''}},`,
    '})',
    '',
  ].join('\n')

  await rm(path.join(out, 'types'), { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await Bun.write(path.join(out, 'routes.ts'), manifest)

  // ── tipos ──
  for (const d of dirs) await Bun.write(path.join(out, 'types', d.dir, '$types.d.ts'), typesFor(d, root, out, pkg))
  await Bun.write(path.join(out, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { rootDirs: [posix(path.relative(out, root)) || '.', './types'] },
  }, null, 2) + '\n')

  return { manifest: path.join(out, 'routes.ts'), routes: dirs.filter(d => d.files['+page'] || d.files['+server']).map(d => d.id), dirs }
}

function typesFor(d: ScannedDir, root: string, out: string, pkg: string): string {
  const here = path.join(out, 'types', d.dir)
  const src = (f: string) => JSON.stringify(posix(path.relative(here, path.join(root, stripExt(f)))))
  const parent = d.parent ? `import('../$types').LayoutData` : '{}'
  const layoutData = d.files['+layout.server'] ? `MergeData<LayoutParentData, LoadData<typeof import(${src(d.files['+layout.server'])})>>` : 'LayoutParentData'
  const pageData = d.files['+page.server'] ? `MergeData<LayoutData, LoadData<typeof import(${src(d.files['+page.server'])})>>` : 'LayoutData'
  const actionData = d.files['+page.server'] ? `ActionDataOf<typeof import(${src(d.files['+page.server'])})>` : 'undefined'
  return `// Gerado pelo htsx (htsx.config.ts) para ${d.dir}. Não edite.
import type { ActionDataOf, Children, LoadData, MaybePromise, MergeData, ParamsOf, RequestEvent, ServerLoadEvent } from ${JSON.stringify(pkg + '/app')}

type Params = ParamsOf<${JSON.stringify(d.id)}>
type LayoutParentData = ${parent}

export type LayoutServerLoad = (event: ServerLoadEvent<Params, LayoutParentData>) => MaybePromise<Record<string, unknown> | void>
export type LayoutData = ${layoutData}
export type LayoutProps = { children?: Children; data: LayoutData; params: Params; event: RequestEvent<Params> }

export type PageServerLoad = (event: ServerLoadEvent<Params, LayoutData>) => MaybePromise<Record<string, unknown> | void>
export type Actions = Record<string, (event: RequestEvent<Params>) => unknown>
export type PageData = ${pageData}
export type ActionData = ${actionData}
export type PageProps = { data: PageData; form: ActionData | undefined; params: Params; event: RequestEvent<Params> }

export type RequestHandler = (event: RequestEvent<Params>) => MaybePromise<Response>
export type EntryGenerator = () => MaybePromise<Params[]>
export type ErrorProps = { status: number; message: string; event: RequestEvent<Params> }
`
}
