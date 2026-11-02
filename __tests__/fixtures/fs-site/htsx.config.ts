import { cloudflareAdapter, defineConfig } from '@repo/htsx/config'

// `bun htsx.config.ts dev` (servidor local) · `bun htsx.config.ts build` (Worker + assets)
export default defineConfig({
  adapter: cloudflareAdapter({ devEnv: { SAUDACAO: 'Olá do dev' } }),
  options: { trailingSlash: 'never' },
})
