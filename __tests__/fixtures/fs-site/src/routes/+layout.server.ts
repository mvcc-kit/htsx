import type { LayoutServerLoad } from './$types'

export const load = (({ locals }) => ({ site: 'Meu site', user: (locals.user as string | undefined) ?? 'visitante' })) satisfies LayoutServerLoad
