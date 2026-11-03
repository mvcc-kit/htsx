// Camadas: o núcleo não importa do design system, a lógica do app não importa os adaptadores
// (lógica separada da implementação) e o que roda no Worker não usa APIs só do Node.
import { describe, expect, it } from 'bun:test'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

async function glob(pattern: string): Promise<string[]> {
  const out: string[] = []
  for await (const f of new Bun.Glob(pattern).scan({ cwd: ROOT })) out.push(f)
  return out.sort()
}

/** Imports de `file`, com os relativos resolvidos para caminhos a partir da raiz. */
function imports(file: string, source: string): string[] {
  return [...source.matchAll(IMPORT_RE)].map(m => {
    const spec = m[1] ?? m[2]!
    return spec.startsWith('.') ? path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)) : spec
  })
}

async function violations(files: string[], forbidden: (spec: string) => boolean): Promise<string[]> {
  const out: string[] = []
  for (const f of files) {
    for (const spec of imports(f, await Bun.file(path.join(ROOT, f)).text())) if (forbidden(spec)) out.push(`${f} → ${spec}`)
  }
  return out
}

const isUi = (s: string) => s.startsWith('htsx-ui') || s === 'ui' || s.startsWith('ui/')
const isAdapterOrBuild = (s: string) => /^src\/(adapters|build)(\/|$)/.test(s) || /^adapter-/.test(s)
const isNodeOnly = (s: string) => s.startsWith('node:') && s !== 'node:async_hooks'

describe('camadas', () => {
  it('núcleo não importa do design system (htsx-ui, ui/)', async () => {
    const core = ['index.ts', 'testing.ts', 'store.ts', 'app.ts', 'adapter-static.ts', 'adapter-cloudflare.ts', 'adapter-cloudflare-build.ts', 'config.ts', 'project.ts', 'adapter-bun.ts', 'jsx.d.ts', ...await glob('src/**/*.{ts,tsx}')]
    expect(await violations(core, isUi)).toEqual([])
  })

  it('lógica do app (src/app) não importa adaptadores nem build', async () => {
    expect(await violations(['app.ts', ...await glob('src/app/**/*.ts')], isAdapterOrBuild)).toEqual([])
  })

  it('o que roda no Worker não usa node:* (exceto node:async_hooks)', async () => {
    const runtime = ['index.ts', 'meta.ts', 'app.ts', 'store.ts', 'config.ts', 'adapter-cloudflare.ts', ...(await glob('src/**/*.ts')).filter(f => !/^src\/(build|testing)\//.test(f) && !['src/adapters/static.ts', 'src/adapters/cloudflare-build.ts', 'src/adapters/bun.ts'].includes(f))]
    expect(await violations(runtime, isNodeOnly)).toEqual([])
  })

  it('as regras de /meta (src/meta/logic.ts) não importam nada', async () => {
    expect(imports('src/meta/logic.ts', await Bun.file(path.join(ROOT, 'src/meta/logic.ts')).text())).toEqual([])
  })

  it('a checagem pega import relativo, pelo nome do pacote e dinâmico', () => {
    expect(imports('src/x.ts', `import { Button } from '../ui/index'`).filter(isUi)).toEqual(['ui/index'])
    expect(imports('index.ts', `export { Badge } from "htsx-ui"`).filter(isUi)).toEqual(['htsx-ui'])
    expect(imports('src/app/x.ts', `const m = await import('../adapters/cloudflare')`).filter(isAdapterOrBuild)).toEqual(['src/adapters/cloudflare'])
    expect(imports('src/x.ts', `import fs from 'node:fs'; import { A } from 'node:async_hooks'`).filter(isNodeOnly)).toEqual(['node:fs'])
  })
})
