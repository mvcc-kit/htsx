// Núcleo da aplicação, sem plataforma: `import { defineApp, route } from '@repo/htsx/app'`.
// Os modos de entrega ficam em @repo/htsx/adapter-static e @repo/htsx/adapter-cloudflare.
export { defineApp, route, sequence, getRequestEvent } from './src/app/app'
export type { App, AppOptions, Route, RouteDef, RequestEvent, PageProps, Platform, Layout, Handle, HandleError, RespondOptions } from './src/app/app'
export { error, redirect, fail, HttpError, Redirect, ActionFailure } from './src/app/errors'
export type { Cookies, CookieOptions } from './src/app/cookies'
export type { ParamsOf, ParamMatcher } from './src/app/routing'
