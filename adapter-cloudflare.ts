// Modo Cloudflare Workers (runtime do Worker): `import { cloudflare } from '@repo/htsx/adapter-cloudflare'`.
// O build fica em '@repo/htsx/adapter-cloudflare/build' (usa node:fs, não vai para o Worker).
export { cloudflare, cloudflarePlatform } from './src/adapters/cloudflare'
export type { CloudflareOptions, CloudflarePlatform, CloudflareManifest, AssetsFetcher, WorkerContext, Worker } from './src/adapters/cloudflare'
export { VENDOR_PATH } from './src/vendor-path'
