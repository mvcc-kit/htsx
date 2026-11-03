// Modo Cloudflare Workers (build, roda no Bun): `import { buildCloudflare } from 'htsx/adapter-cloudflare/build'`.
export { buildCloudflare, assetsFromDir, validateWrangler, parseJsonc } from './src/adapters/cloudflare-build'
export type { CloudflareBuildOptions, CloudflareBuildResult } from './src/adapters/cloudflare-build'
