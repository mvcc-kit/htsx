// Regras sobre a requisição, sem plataforma e sem estado: dados entram, decisão sai.

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']
const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE']

/** Caminho com a barra final certa, ou o próprio caminho se já está certo. */
export function canonicalPath(pathname: string, mode: 'never' | 'always'): string {
  if (pathname === '/') return pathname
  if (mode === 'never') {
    if (!pathname.endsWith('/')) return pathname
    // "//evil.com/" sem a barra final viraria "//evil.com", que o navegador lê como outro site
    return pathname.replace(/\/+$/, '').replace(/^\/{2,}/, '/') || '/'
  }
  if (pathname.endsWith('/') || /\.[a-z0-9]+$/i.test(pathname)) return pathname
  return `${pathname.replace(/^\/{2,}/, '/')}/`
}

/** Caminho usado para achar a rota: barra no fim não muda a rota (POST para /contato/ casa com /contato). */
export function routePath(pathname: string): string {
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '')
}

export function wantsHtml(accept: string | null): boolean {
  return (accept ?? '').includes('text/html')
}

export function wantsJsonOnly(accept: string | null): boolean {
  return (accept ?? '').includes('application/json') && !wantsHtml(accept)
}

/** Envio de formulário vindo de outro site. Só formulário: JSON entre sites já exige preflight. */
export function isCrossSiteForm(input: {
  method: string
  contentType: string | null
  origin: string | null
  self: string
  trusted: readonly string[]
}): boolean {
  if (!MUTATING.includes(input.method)) return false
  const type = (input.contentType ?? '').split(';')[0]!.trim().toLowerCase()
  if (type && !FORM_TYPES.includes(type)) return false
  return input.origin !== input.self && (!input.origin || !input.trusted.includes(input.origin))
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/** Cookie Secure sempre, menos em http local: o navegador recusaria. */
export function secureCookiesByDefault(url: URL): boolean {
  return !(url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname))
}

/**
 * Destino de redirecionamento vindo do usuário (ex.: `?next=`): só caminho deste site.
 * `//site`, `/\\site` e `/\tsite` são lidos pelo navegador como outro site.
 */
export function localPath(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/')) return fallback
  if (target.startsWith('//') || target.includes('\\') || /[\u0000-\u001f\u007f]/.test(target)) return fallback
  return target
}
