#!/usr/bin/env bun
// htsx sync [--watch] [--root .] [--routes src/routes] [--params src/params] [--out .htsx] [--pkg @repo/htsx]
import { watch } from 'node:fs'
import path from 'node:path'
import { syncRoutes, type SyncOptions } from './src/build/routes'

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name: string) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined }

if (cmd !== 'sync') {
  console.error('uso: htsx sync [--watch] [--root .] [--routes src/routes] [--params src/params] [--out .htsx] [--pkg @repo/htsx]')
  process.exit(cmd ? 1 : 0)
}

const opts: SyncOptions = { root: flag('root'), routes: flag('routes'), params: flag('params'), out: flag('out'), pkg: flag('pkg') }
async function run() {
  try {
    const r = await syncRoutes(opts)
    console.log(`htsx: ${r.routes.length} rotas → ${path.relative(process.cwd(), r.manifest)}`)
  } catch (e) {
    console.error((e as Error).message)
    if (!rest.includes('--watch')) process.exit(1)
  }
}
await run()
if (rest.includes('--watch')) {
  const dirs = [opts.routes ?? 'src/routes', opts.params ?? 'src/params'].map(d => path.resolve(opts.root ?? '.', d))
  let timer: ReturnType<typeof setTimeout> | undefined
  for (const d of dirs) {
    try {
      // só nome de arquivo novo/apagado muda o manifesto; conteúdo é recarregado pelo próprio Bun
      watch(d, { recursive: true }, ev => { if (ev === 'rename') { clearTimeout(timer); timer = setTimeout(run, 50) } })
    } catch { /* pasta inexistente */ }
  }
  console.log('htsx: observando as rotas (Ctrl+C para sair)')
}
