#!/usr/bin/env bun
// Atualiza vendor/: baixa do registro npm a versão fixada em vendor/pins.json,
// confere a integridade do pacote (sha512 do registro) e grava o arquivo e o sha256.
// Uso: bun scripts/vendor.ts            (refaz os arquivos das versões fixadas)
//      bun scripts/vendor.ts alpinejs 3.18.0   (troca a versão de um pacote)
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const PINS = path.join(import.meta.dir, '..', 'vendor', 'pins.json')

interface Pin { package: string; version: string; path: string; file: string; sha256: string }

const pins: Record<string, Pin> = await Bun.file(PINS).json()
const [onlyPkg, newVersion] = process.argv.slice(2)

for (const [name, pin] of Object.entries(pins)) {
  if (onlyPkg && pin.package !== onlyPkg) continue
  if (newVersion) pin.version = newVersion

  const meta = await (await fetch(`https://registry.npmjs.org/${pin.package}/${pin.version}`)).json() as {
    dist: { tarball: string; integrity: string }
  }
  const tgz = new Uint8Array(await (await fetch(meta.dist.tarball)).arrayBuffer())
  const sri = 'sha512-' + new Bun.CryptoHasher('sha512').update(tgz).digest('base64')
  if (sri !== meta.dist.integrity) throw new Error(`${pin.package}@${pin.version}: integridade do pacote não confere`)

  const dir = await mkdtemp(path.join(tmpdir(), 'htsx-vendor-'))
  await Bun.write(path.join(dir, 'p.tgz'), tgz)
  const tar = Bun.spawnSync(['tar', '-xzf', 'p.tgz', `package/${pin.path}`], { cwd: dir })
  if (tar.exitCode !== 0) throw new Error(`${pin.package}: ${pin.path} não está no pacote`)
  const bytes = new Uint8Array(await Bun.file(path.join(dir, 'package', pin.path)).arrayBuffer())
  await rm(dir, { recursive: true, force: true })

  await Bun.write(path.join(path.dirname(PINS), pin.file), bytes)
  pin.sha256 = new Bun.CryptoHasher('sha256').update(bytes).digest('hex')
  console.log(`${name}: ${pin.package}@${pin.version} → vendor/${pin.file} (${bytes.length} bytes)`)
}

await Bun.write(PINS, JSON.stringify(pins, null, 2) + '\n')
