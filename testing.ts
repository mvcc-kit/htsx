// Ferramentas de teste do htsx: `import { page } from '@mvcc-kit/htsx/testing'`.
// Fica fora do barrel principal para não entrar no código de produção.
export { page } from './src/testing/query'
export type { Page, Found } from './src/testing/query'
export { open, findChrome } from './src/testing/browser'
export type { App, OpenOpts, InspectResult } from './src/testing/browser'
export { modes } from './src/testing/modes'
export type { Mode, ModeName, ModesOptions } from './src/testing/modes'
