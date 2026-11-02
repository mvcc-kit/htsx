// Tamanho minificado das entradas públicas, comparado com o teto de size-limit.json.
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')

export interface Limit { maxBytes: number; motivo: string }
export interface Size { entry: string; bytes: number; gzip: number; limit: Limit }

export async function measure(): Promise<Size[]> {
  const limits: Record<string, Limit> = await Bun.file(path.join(ROOT, 'size-limit.json')).json()
  const sizes: Size[] = []
  for (const [entry, limit] of Object.entries(limits)) {
    const r = await Bun.build({ entrypoints: [path.join(ROOT, entry)], target: 'bun', minify: true, external: ['node:*'] })
    if (!r.success) throw new AggregateError(r.logs, `build de ${entry} falhou`)
    const bytes = new Uint8Array(await r.outputs[0]!.arrayBuffer())
    sizes.push({ entry, bytes: bytes.length, gzip: Bun.gzipSync(bytes).length, limit })
  }
  return sizes
}
