#!/usr/bin/env bun
// Placar do htsx: testes, tamanho minificado, o que ainda some sem aviso e pendências de TAREFAS.md.
// Uso: bun run scorecard
import path from 'node:path'
import { measure } from './size'

const ROOT = path.join(import.meta.dir, '..')

// 1. Testes (síncrono, um processo só)
const run = Bun.spawnSync(['bun', 'test'], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' })
const out = run.stdout.toString() + run.stderr.toString()
const count = (re: RegExp) => Number(re.exec(out)?.[1] ?? 0)
const tests = { pass: count(/^\s*(\d+) pass$/m), fail: count(/^\s*(\d+) fail$/m), skip: count(/^\s*(\d+) skip$/m) }

// 2. Tamanho
const sizes = await measure()

// 3. O que some sem aviso mesmo no modo estrito: cada caso deve lançar erro "htsx: ...".
process.env.HTSX_STRICT = '1'
const { createElement: h } = await import('../src/jsx-runtime')
const { head } = await import('../src/head')
const probes: Array<[string, () => unknown]> = [
  ['Date como filho', () => h('p', {}, new Date(0))],
  ['objeto como filho', () => h('p', {}, { a: 1 })],
  ['bigint como filho', () => h('p', {}, 1n)],
  ['função como filho', () => h('p', {}, () => 1)],
  ['symbol como filho', () => h('p', {}, Symbol('x'))],
  ['texto comum em <script>', () => h('script', {}, 'x')],
  ['atributo on*', () => h('a', { onclick: 'x' })],
  ['nome de atributo inválido', () => h('a', { 'a b': 'x' })],
  ['URL perigosa trocada por #', () => h('a', { href: 'javascript:x' })],
  ['CDN sem integrity (versão fora da fixada)', () => head({ htmx: { version: '1.0.0' } })],
  ['chave CSS inválida em style', () => h('p', { style: { 'a;b': 'x' } })],
  ['< ou > removido de valor CSS', () => h('p', { style: { color: 'red<' } })],
]
const silent: string[] = []
for (const [name, fn] of probes) {
  try { await fn(); silent.push(name) } catch (e) { if (!String(e).includes('htsx:')) silent.push(`${name} (erro sem prefixo htsx:)`) }
}

// 4. Pendências
const tarefas = await Bun.file(path.join(ROOT, 'TAREFAS.md')).text()
const pending = tarefas.split('\n').filter(l => l.startsWith('- [ ]')).map(l => l.slice(6))
const done = tarefas.split('\n').filter(l => l.startsWith('- [x]')).length

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
console.log(`# Placar do htsx

Testes:   ${tests.pass} passando, ${tests.fail} falhando, ${tests.skip} pulados
Tamanho:  ${sizes.map(s => `${s.entry} ${kb(s.bytes)} (gzip ${kb(s.gzip)}, teto ${kb(s.limit.maxBytes)})`).join(' · ')}
Avisos:   ${probes.length - silent.length}/${probes.length} casos dão erro no modo estrito
Some sem aviso: ${silent.length ? '\n' + silent.map(s => `  - ${s}`).join('\n') : 'nada'}
Tarefas:  ${done} feitas, ${pending.length} pendentes${pending.length ? '\n' + pending.map(p => `  - ${p.slice(0, 110)}`).join('\n') : ''}`)

const over = sizes.filter(s => s.bytes > s.limit.maxBytes)
process.exit(tests.fail > 0 || over.length > 0 ? 1 : 0)
