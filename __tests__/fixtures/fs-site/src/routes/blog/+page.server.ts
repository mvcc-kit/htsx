import type { PageServerLoad } from './$types'
import { posts } from '../../posts'

export const prerender = true

export const load = (() => ({ posts: Object.keys(posts) })) satisfies PageServerLoad
