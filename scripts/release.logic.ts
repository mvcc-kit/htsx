// Regras de versão, sem Git nem rede. O fluxo está em RELEASING.md.
export interface Version { major: number; minor: number; patch: number; beta: boolean }

const VERSION = /^(\d+)\.(\d+)\.(\d+)(-beta)?$/
const DAY_MS = 24 * 60 * 60 * 1000

/** Títulos aceitos nas notas de uma versão. */
export const NOTE_HEADINGS = ['Adicionado', 'Melhorado', 'Corrigido', 'Segurança', 'Mudanças de quebra'] as const

export function parseVersion(text: string): Version | null {
  const m = VERSION.exec(text)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), beta: Boolean(m[4]) }
}

/** Negativo se `a` vem antes de `b`. Beta vem antes da versão final de mesmo número. */
export function compareVersions(a: Version, b: Version): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch || Number(b.beta) - Number(a.beta)
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

/** A próxima versão: sempre o último número mais 1. */
export function nextVersion(latest: string): string {
  const v = parseVersion(latest)
  if (!v) throw new Error(`htsx: versão inválida: ${latest}`)
  return `${v.major}.${v.minor}.${v.patch + 1}${v.beta ? '-beta' : ''}`
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

/** Motivo para recusar as notas, ou null. Título vazio ou desconhecido não passa. */
export function notesProblem(notes: string): string | null {
  const headings = notes.split('\n').filter(l => l.startsWith('### ')).map(l => l.slice(4).trim())
  if (headings.length === 0) return `as notas precisam de pelo menos um destes títulos: ${NOTE_HEADINGS.join(', ')}`
  const unknown = headings.find(h => !(NOTE_HEADINGS as readonly string[]).includes(h))
  if (unknown) return `título "${unknown}" não existe; use: ${NOTE_HEADINGS.join(', ')}`
  for (const part of notes.split(/^### /m).slice(1)) {
    if (!part.split('\n').some(l => l.startsWith('- '))) return `"${part.split('\n')[0]}" está sem itens`
  }
  return null
}

/** Motivo para recusar a versão, ou null se puder publicar. */
export function versionProblem(version: string, tags: readonly string[], changelog: string): string | null {
  if (!parseVersion(version)) return `"${version}" não segue X.Y.Z-beta ou X.Y.Z`
  if (tags.includes(`v${version}`)) return `a tag v${version} já existe; tag publicada não muda`
  const latest = latestVersion(tags)
  // Sair do beta é o único salto permitido.
  if (latest && version !== '1.0.0' && version !== nextVersion(latest)) return `a próxima versão é ${nextVersion(latest)}, não ${version}`
  const notes = changelogSection(changelog, version)
  if (!notes) return `CHANGELOG.md não tem a seção "## ${version}" com conteúdo`
  return notesProblem(notes)
}

/** Motivo para esperar, ou null. No máximo uma versão por dia, salvo falha de segurança descrita nas notas. */
export function cadenceProblem(lastReleaseMs: number | null, nowMs: number, security: boolean, notes = ''): string | null {
  if (security && !/^### Segurança$/m.test(notes)) return '--security exige a seção "### Segurança" nas notas, dizendo qual é a falha'
  if (security || lastReleaseMs === null) return null
  const waitMs = lastReleaseMs + DAY_MS - nowMs
  if (waitMs <= 0) return null
  return `no máximo uma versão por dia; faltam ${Math.ceil(waitMs / (60 * 60 * 1000))} h. Só falha de segurança usa --security`
}

/** Entradas públicas de `exports` que dá para importar (sem curingas nem JSX). */
export function importableEntries(name: string, exports: Record<string, string>): string[] {
  return Object.keys(exports)
    .filter(k => !k.includes('*') && !k.includes('jsx-'))
    .map(k => (k === '.' ? name : `${name}/${k.slice(2)}`))
}
