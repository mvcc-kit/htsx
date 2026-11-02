// O núcleo nunca importa do design system (@repo/htsx-ui, pasta ui/).
import { describe, expect, it } from 'bun:test'
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

async function coreFiles(): Promise<string[]> {
  const files = ['index.ts', 'testing.ts', 'store.ts', 'jsx.d.ts']
  for await (const f of new Bun.Glob('src/**/*.{ts,tsx}').scan({ cwd: ROOT })) files.push(f)
  return files
}

/** Imports de `file` que apontam para o design system. */
function uiImports(file: string, source: string): string[] {
  const bad: string[] = []
  for (const m of source.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2]!
    const resolved = spec.startsWith('.') ? path.relative(ROOT, path.resolve(ROOT, path.dirname(file), spec)) : spec
    if (spec.startsWith('@repo/htsx-ui') || resolved === 'ui' || resolved.startsWith('ui/')) bad.push(spec)
  }
  return bad
}

describe('camadas: src/ não importa do design system', () => {
  it('nenhum arquivo do núcleo importa @repo/htsx-ui ou ui/', async () => {
    const problems: string[] = []
    for (const f of await coreFiles()) {
      for (const spec of uiImports(f, await Bun.file(path.join(ROOT, f)).text())) problems.push(`${f} → ${spec}`)
    }
    expect(problems).toEqual([])
  })

  it('a checagem pega import relativo e pelo nome do pacote', () => {
    expect(uiImports('src/x.ts', `import { Button } from '../ui/index'`)).toEqual(['../ui/index'])
    expect(uiImports('index.ts', `export { Badge } from "@repo/htsx-ui"`)).toEqual(['@repo/htsx-ui'])
    expect(uiImports('src/x.ts', `const m = await import('@repo/htsx-ui')`)).toEqual(['@repo/htsx-ui'])
    expect(uiImports('src/x.ts', `import { clx } from './clx'`)).toEqual([])
  })
})
