import { cloudflareAdapter, defineConfig } from 'htsx/config'

// `bun htsx.config.ts dev` (servidor local) · `bun htsx.config.ts build` (Worker + assets)
// event.platform.env vem do wrangler.jsonc em todo lugar (dev, testes, prerender e Worker)
export default defineConfig({
  adapter: cloudflareAdapter({ platformProxy: { persist: false } }),
  options: { trailingSlash: 'never' },
})
