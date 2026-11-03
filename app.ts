// Núcleo da aplicação, sem plataforma: `import { defineApp, route } from '@mvcc-kit/htsx/app'`.
// Os modos de entrega ficam em @mvcc-kit/htsx/adapter-static e @mvcc-kit/htsx/adapter-cloudflare.
export { defineApp, route, sequence, getRequestEvent } from './src/app/app'
export type { App, AppOptions, Route, RouteDef, RequestEvent, PageProps, Platform, Layout, Handle, HandleError, RespondOptions } from './src/app/app'
export { error, redirect, fail, HttpError, Redirect, ActionFailure } from './src/app/errors'
export type { Cookies, CookieOptions } from './src/app/cookies'
export type { ParamsOf, ParamMatcher } from './src/app/routing'
export { fileRoutes } from './src/app/file-routes'
export type { FileRoutes, FileRoutesInput, RouteFiles, RouteLevel, ServerLoadEvent, LoadData, MergeData, ActionDataOf, MaybePromise } from './src/app/file-routes'
export type { Children } from './src/jsx-types'
export type { ErrorPage } from './src/app/app'
