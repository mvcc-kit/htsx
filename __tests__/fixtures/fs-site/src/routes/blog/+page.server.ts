import type { PageServerLoad } from './$types'
import { posts } from '../../posts'

export const load = (() => ({ posts: Object.keys(posts) })) satisfies PageServerLoad
