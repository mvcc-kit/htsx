// Documentação: llms.txt gerado de SKILL.md, e todo bloco ts/tsx de SKILL.md e README.md
// compila (tsc) e roda (import) no modo estrito.
import { beforeAll, describe, expect, it } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { codeBlocks, llmsFromSkill } from '../scripts/docs'

const ROOT = path.join(import.meta.dir, '..')
const OUT = path.join(ROOT, '.cache', 'docs')
const DOCS = ['SKILL.md', 'README.md']

const read = (f: string) => Bun.file(path.join(ROOT, f)).text()

describe('docs: uma fonte só', () => {
  it('llms.txt está em dia com SKILL.md (rode `bun run docs`)', async () => {
    expect(await read('llms.txt')).toBe(llmsFromSkill(await read('SKILL.md')))
  })
})

describe('docs: exemplos compilam e rodam', async () => {
  const files: Array<{ name: string; file: string; code: string }> = []
  for (const doc of DOCS) {
    for (const b of codeBlocks(await read(doc))) {
      files.push({
        name: `${doc}:${b.line}`,
        file: path.join(OUT, `${doc.replace('.md', '')}-${b.line}.${b.lang}`),
        // `export {}` garante que cada bloco é um módulo isolado
        code: `${b.code.replaceAll('{{PKG}}', '@repo/htsx')}\nexport {}\n`,
      })
    }
  }

  beforeAll(async () => {
    await rm(OUT, { recursive: true, force: true })
    await mkdir(OUT, { recursive: true })
    for (const f of files) await Bun.write(f.file, f.code)
    await Bun.write(path.join(OUT, 'tsconfig.json'), JSON.stringify({
      extends: '../../tsconfig.json',
      compilerOptions: {
        paths: {
          '@repo/htsx': ['../../index.ts'],
          '@repo/htsx/store': ['../../store.ts'],
          '@repo/htsx/testing': ['../../testing.ts'],
          '@repo/htsx/jsx-runtime': ['../../src/jsx-runtime.ts'],
          '@repo/htsx/jsx-dev-runtime': ['../../src/jsx-runtime.ts'],
        },
      },
      include: ['*.ts', '*.tsx', '../../jsx.d.ts'],
      exclude: [],
    }))
  })

  it(`${files.length} blocos compilam (tsc)`, () => {
    const r = Bun.spawnSync(['bunx', 'tsc', '--noEmit', '-p', OUT], { cwd: ROOT })
    const out = r.stdout.toString().replaceAll(OUT + '/', '')
    expect(out).toBe('')
  }, 30_000)

  for (const f of files) {
    it(`${f.name} roda`, async () => { await import(f.file) })
  }
})
