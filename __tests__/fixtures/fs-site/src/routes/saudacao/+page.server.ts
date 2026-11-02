import { cloudflarePlatform } from '@repo/htsx/adapter-cloudflare'
import type { PageServerLoad } from './$types'

// vars do wrangler.jsonc: as mesmas no dev, nos testes, no prerender e no Worker
export const load = (event => ({ saudacao: cloudflarePlatform<{ SAUDACAO: string }>(event).env.SAUDACAO })) satisfies PageServerLoad
