import { sequence, type Handle } from '@mvcc-kit/htsx/app'

export const handle: Handle = sequence(async ({ event, resolve }) => {
  const user = event.cookies.get('user')
  if (user) event.locals.user = user
  return resolve(event)
})
