// Regras de versão, sem Git nem rede. O fluxo está em RELEASING.md.
export interface Version { major: number; minor: number; patch: number; beta: number | null }

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.([1-9]\d*))?$/

export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), beta: m[4] ? Number(m[4]) : null }
}

/** Negativo se `a` vem antes de `b`. Beta vem antes da versão final de mesmo número. */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
    || (a.beta ?? Number.POSITIVE_INFINITY) - (b.beta ?? Number.POSITIVE_INFINITY)
}

/** Maior versão entre as tags `vX.Y.Z`; ignora as que não seguem o formato. */
export function latestVersion(tags: readonly string[]): string | null {
  let best: { text: string; version: Version } | null = null
  for (const tag of tags) {
    const text = tag.replace(/^v/, '')
    const version = tag.startsWith('v') ? parseVersion(text) : null
    if (version && (!best || compareVersions(version, best.version) > 0)) best = { text, version }
  }
  return best?.text ?? null
}

/** Texto da seção `## <versão>` do changelog, ou null se não houver ou estiver vazia. */
export function changelogSection(changelog: string, version: string): string | null {
  const lines = changelog.split('\n')
  const start = lines.findIndex(l => l === `## ${version}` || l.startsWith(`## ${version} `))
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex(l => l.startsWith('## '))
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim() || null
}

/** Motivo para recusar a versão, ou null se puder publicar. */
export function versionProblem(version: string, tags: readonly string[], changelog: string): string | null {
  const parsed = parseVersion(version)
  if (!parsed) return `"${version}" não segue X.Y.Z ou X.Y.Z-beta.N`
  if (tags.includes(`v${version}`)) return `a tag v${version} já existe; tag publicada não muda`
  const latest = latestVersion(tags)
  if (latest && compareVersions(parsed, parseVersion(latest)!) <= 0) return `${version} não é maior que a última versão, ${latest}`
  if (!changelogSection(changelog, version)) return `CHANGELOG.md não tem a seção "## ${version}" com conteúdo`
  return null
}

/** Entradas públicas de `exports` que dá para importar (sem curingas nem JSX). */
export function importableEntries(name: string, exports: Record<string, string>): string[] {
  return Object.keys(exports)
    .filter(k => !k.includes('*') && !k.includes('jsx-'))
    .map(k => (k === '.' ? name : `${name}/${k.slice(2)}`))
}
