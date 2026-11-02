// A lógica do app: rotas por arquivos + hooks. Os modos de entrega importam este `app`.
import { defineApp, sequence } from '@repo/htsx/app'
import { files } from '../.htsx/routes'

export const app = defineApp({
  ...files,
  handle: sequence(async ({ event, resolve }) => {
    const user = event.cookies.get('user')
    if (user) event.locals.user = user
    return resolve(event)
  }),
})
