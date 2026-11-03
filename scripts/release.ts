#!/usr/bin/env bun
// Publica uma versão: bun run release <versão> [--dry-run]. O fluxo está em RELEASING.md.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { changelogSection, importableEntries, parseVersion, versionProblem } from './release.logic'

const ROOT = path.join(import.meta.dir, '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const version = args.find(a => !a.startsWith('--'))

function fail(message: string): never {
  console.error(`Parado: ${message}`)
  process.exit(1)
}

function run(cmd: string[], cwd = ROOT): string {
  const r = Bun.spawnSync(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' })
  if (r.exitCode !== 0) fail(`${cmd.join(' ')}\n${r.stdout.toString()}${r.stderr.toString()}`)
  return r.stdout.toString().trim()
}

function step(title: string): void {
  console.log(`\n→ ${title}`)
}

if (!version) fail('informe a versão, por exemplo: bun run release 0.1.0-beta.2 --dry-run')

step('Conferindo o repositório')
if (run(['git', 'branch', '--show-current']) !== 'main') fail('publique a partir de main')
if (run(['git', 'status', '--porcelain'])) fail('há mudanças sem commit')
run(['git', 'fetch', '--tags', 'origin'])
if (run(['git', 'rev-parse', 'HEAD']) !== run(['git', 'rev-parse', 'origin/main'])) fail('main está diferente de origin/main')
const tags = run(['git', 'tag', '--list']).split('\n').filter(Boolean)
const changelog = await Bun.file(path.join(ROOT, 'CHANGELOG.md')).text()
const problem = versionProblem(version, tags, changelog)
if (problem) fail(problem)

step('Rodando testes e tipos')
run(['bun', 'test'])
run(['bunx', 'tsc', '--noEmit', '-p', '.'])
run(['bunx', 'tsc', '--noEmit', '-p', 'ui'])
if (run(['git', 'status', '--porcelain'])) fail('os testes mudaram arquivos versionados')

step('Instalando o que está no Git num projeto vazio')
const pkgPath = path.join(ROOT, 'package.json')
const pkg = await Bun.file(pkgPath).json() as { name: string; version: string; exports: Record<string, string> }
const consumer = mkdtempSync(path.join(tmpdir(), 'htsx-release-'))
try {
  run(['git', 'archive', '--format=tar.gz', '--prefix=package/', '-o', path.join(consumer, 'pacote.tgz'), 'HEAD'])
  await Bun.write(path.join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module', dependencies: { [pkg.name]: './pacote.tgz' } }))
  run(['bun', 'install'], consumer)
  const entries = importableEntries(pkg.name, pkg.exports)
  await Bun.write(path.join(consumer, 'check.ts'), `${entries.map(e => `await import(${JSON.stringify(e)})`).join('\n')}\nconsole.log('ok')\n`)
  if (run(['bun', 'check.ts'], consumer) !== 'ok') fail('as entradas públicas não importaram')
  console.log(`  ${entries.length} entradas importadas`)
} finally {
  rmSync(consumer, { recursive: true, force: true })
}

if (dryRun) {
  console.log(`\nEnsaio ok. Nada foi publicado. Para publicar: bun run release ${version}`)
  process.exit(0)
}

step('Criando commit e tag')
if (pkg.version !== version) {
  await Bun.write(pkgPath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`)
  run(['git', 'add', 'package.json'])
  run(['git', 'commit', '-m', `chore: versão ${version}`])
}
const tag = `v${version}`
run(['git', 'tag', '-a', tag, '-m', `htsx ${version}`])

step('Enviando para o GitHub')
run(['git', 'push', '--atomic', 'origin', 'main', tag])

step('Criando a release')
const notes = changelogSection(changelog, version)!
const beta = parseVersion(version)!.beta !== null
console.log(run(['gh', 'release', 'create', tag, '--verify-tag', '--title', tag, '--notes', notes, ...(beta ? ['--prerelease'] : [])]))

console.log(`\nPublicada. Quem usa instala com "${pkg.name}": "github:mvcc-kit/htsx#${tag}"`)
