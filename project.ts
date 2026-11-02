// O que `bun htsx.config.ts <comando>` faz, para usar em código (scripts, testes):
// `import { loadApp, build, start, sync } from '@repo/htsx/project'`.
export { loadApp, build, start, sync, emulatePlatform } from './src/build/commands'
export type { LoadedApp, LoadOptions } from './src/build/commands'
