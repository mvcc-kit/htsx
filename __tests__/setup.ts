import { afterAll, beforeAll } from 'bun:test'

process.env.HTSX_STRICT = '1'

/** Chame no topo de um `describe` que testa o comportamento seguro fora do modo estrito. */
export function withoutStrictMode(): void {
  beforeAll(() => { delete process.env.HTSX_STRICT })
  afterAll(() => { process.env.HTSX_STRICT = '1' })
}
