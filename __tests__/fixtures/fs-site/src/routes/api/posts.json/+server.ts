import type { RequestHandler } from './$types'
import { posts } from '../../../posts'

export const GET = (() => Response.json(Object.keys(posts))) satisfies RequestHandler
