// Implementação Cloudflare: só liga o app ao Worker ("main" do wrangler).
import { cloudflare } from '@repo/htsx/adapter-cloudflare'
import { app } from './app'
import manifest from '../cloudflare-manifest.json'   // gerado por buildCloudflare

export default cloudflare<{ SAUDACAO: string }>(app, { manifest })
