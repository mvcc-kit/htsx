#!/usr/bin/env bun
// Benchmark do que roda a cada requisição. Uso: bun scripts/bench.ts
// Compare antes e depois na mesma máquina; os números absolutos variam de uma para outra.
import { createElement as h, Fragment, raw, renderPage, renderToString } from '../index'
import { Head, Outlet, Title } from '../meta'
import { defineApp, partial, route } from '../kit'
import { escapeHtml } from '../src/escape'
import { serializeAttrs } from '../src/attrs'
import { weakEtag } from '../src/app/etag'

process.env.NODE_ENV = 'production'
delete process.env.HTSX_STRICT

async function bench(name: string, fn: () => unknown, ms = 700): Promise<void> {
  for (let i = 0; i < 200; i++) await fn() // aquece o JIT
  const start = performance.now()
  let n = 0
  while (performance.now() - start < ms) { await fn(); n++ }
  const us = ((performance.now() - start) / n) * 1000
  console.log(`${name.padEnd(38)} ${us < 1 ? us.toFixed(3) : us.toFixed(1).padStart(9)} µs/op  ${Math.round(n / (ms / 1000)).toLocaleString('en').padStart(11)} op/s`)
}

const plain = 'Texto comum sem nada para escapar, como quase tudo numa página de verdade.'
const dirty = 'Texto com <tags> & "aspas" que precisa de escape em vários lugares <b>'
const attrs = { id: 'item-1', class: 'row active', 'data-id': 42, href: '/items/1', 'hx-get': '/items/1', 'hx-target': '#x', $click: 'open = true', 'aria-expanded': false, disabled: false, title: 'Abrir' }

const rows = Array.from({ length: 500 }, (_, i) => ({ id: i, name: `Item ${i}`, href: `/items/${i}`, active: i % 2 === 0 }))
const Row = ({ row }: { row: (typeof rows)[number] }) => h('tr', { class: row.active ? 'on' : 'off', 'data-id': row.id },
  h('td', {}, row.id), h('td', {}, h('a', { href: row.href, 'hx-get': row.href, 'hx-target': '#x' }, row.name)), h('td', {}, row.active ? 'Sim' : 'Não'))
const table = () => h('table', { class: 'grid' }, h('tbody', {}, rows.map(row => h(Row, { row }))))
const small = () => h('main', { class: 'wrap' }, h('h1', {}, 'Título'), h('p', {}, plain), h('a', { href: '/x' }, 'Link'))

const List = partial({ render: () => h('ul', {}, h('li', {}, 'um')) })
const Layout = ({ children }: { children?: unknown }) => h('html', { lang: 'pt' }, h(Head, {}, h(Title, {}, 'Site')), h('body', { 'hx-boost': 'true' }, h('nav', {}, h('a', { href: '/' }, 'Início')), h(Outlet, {}, children)))
const routes = [
  route('/', { partials: { list: List }, load: () => ({ a: 1 }), page: () => small() }),
  route('/blog/[slug]', { page: ({ params }) => h('p', {}, params.slug) }),
  ...Array.from({ length: 200 }, (_, i) => route(`/r${i}/[id]`, { page: () => h('p', {}, 'x') })),
]
const app = defineApp({ layout: Layout as never, routes })
const req = (path: string, headers: Record<string, string> = {}) => new Request(`https://x.dev${path}`, { headers })

await bench('escapeHtml (texto limpo)', () => escapeHtml(plain))
await bench('escapeHtml (com escape)', () => escapeHtml(dirty))
await bench('serializeAttrs (10 atributos)', () => serializeAttrs(attrs, 'a'))
await bench('elemento pequeno', () => small())
await bench('renderToString pequeno', () => renderToString(small))
await bench('tabela 500 linhas', () => renderToString(table))
await bench('renderPage com Head', () => renderPage(() => h('html', {}, h(Head, {}), h('body', {}, small()))))
await bench('ETag de 100 KB', () => weakEtag('x'.repeat(100_000)))
await bench('respond: página com layout', () => app.respond(req('/')))
await bench('respond: parcial Outlet', () => app.respond(req('/', { 'hx-request': 'true', 'hx-boosted': 'true', 'hx-target': 'htsx-page' })))
await bench('respond: parcial ?/list', () => app.respond(req('/?/list', { 'hx-request': 'true' })))
await bench('respond: 1ª rota dinâmica de 202', () => app.respond(req('/blog/ola')))
await bench('respond: última rota dinâmica', () => app.respond(req('/r199/1')))
await bench('respond: 404 com 202 rotas', () => app.respond(req('/nada/mesmo/aqui')))
void Fragment; void raw
