// Configuração do projeto: `htsx.config.ts` com `export default defineConfig({ adapter: ... })`.
export { defineConfig, staticAdapter, cloudflareAdapter, bunAdapter } from './src/config/config'
export type { HtsxConfig, Adapter, StaticAdapter, CloudflareAdapter, BunAdapter, ConfigAppOptions, Command } from './src/config/config'
