// Implementação Cloudflare: só liga o app ao Worker (arquivo "main" do wrangler).
import { cloudflare } from '../../../adapter-cloudflare'
import { workerApp } from './app'
import manifest from './cloudflare-manifest.json'   // gerado por buildCloudflare

export default cloudflare<{ SAUDACAO: string }>(workerApp, { manifest })
