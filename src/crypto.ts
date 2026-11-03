// Primitivas de assinatura usadas por CSRF e flash. Web Crypto: funciona no Bun e no Worker.
const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()

export const MIN_SECRET_LENGTH = 32

export function isStrongSecret(secret: unknown): secret is string {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH
}

export function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url de texto UTF-8 (`btoa` sozinho só aceita Latin-1). */
export function textToB64Url(text: string): string {
  return bytesToB64Url(ENCODER.encode(text))
}

export function b64UrlToText(value: string): string {
  const pad = (4 - (value.length % 4)) % 4
  const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return DECODER.decode(bytes)
}

export async function hmacSha256(key: string, data: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', ENCODER.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToB64Url(new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, ENCODER.encode(data))))
}

/** Compara sem revelar, pelo tempo, onde os textos divergem. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
