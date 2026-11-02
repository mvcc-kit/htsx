// Toda entrada de package.json "exports" existe e importa sem erro (pelo nome do pacote),
// e cada arquivo de entrada na raiz está nos exports.
import { describe, expect, it } from 'bun:test'
import path from 'node:path'
import pkg from '../package.json'

const ROOT = path.join(import.meta.dir, '..')

describe('package.json exports', () => {
  for (const [key, target] of Object.entries(pkg.exports)) {
    if (key.includes('*')) continue
    it(`${key} → ${target} importa`, async () => {
      const mod = await import(`${pkg.name}${key.slice(1)}`)
      expect(Object.keys(mod).length).toBeGreaterThan(0)
    })
  }

  it('vendor/* resolve pelo nome do pacote', () => {
    expect(import.meta.resolve(`${pkg.name}/vendor/pins.json`)).toBe(Bun.pathToFileURL(path.join(ROOT, 'vendor', 'pins.json')).href)
  })

  it('todo .ts de entrada na raiz está nos exports', async () => {
    const targets = new Set(Object.values(pkg.exports))
    const notEntries = new Set(['build.ts'])
    for await (const f of new Bun.Glob('*.ts').scan({ cwd: ROOT })) {
      if (f.endsWith('.d.ts') || notEntries.has(f)) continue
      expect(targets.has(`./${f}`), `${f} não está em package.json exports`).toBe(true)
    }
  })
})
