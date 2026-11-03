import { describe, expect, it } from 'bun:test'
import { cadenceProblem, changelogSection, compareVersions, importableEntries, latestVersion, nextVersion, notesProblem, parseVersion, versionProblem } from '../scripts/release.logic'

const v = (text: string) => parseVersion(text)!
const CHANGELOG = '# Changelog\n\n## 0.1.1-beta (03/11/2026)\n\n### Corrigido\n\n- Corrige algo.\n\n## 0.1.0-beta (02/11/2026)\n\n### Adicionado\n\n- Primeira.\n\n## 0.1.2-beta\n\n## 0.1.3-beta\n\nSem título.\n'

describe('versões', () => {
  it('aceita X.Y.Z-beta e X.Y.Z; recusa o resto', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, beta: false })
    expect(parseVersion('0.1.2-beta')?.beta).toBe(true)
    for (const bad of ['v1.2.3', '1.2', '1.2.3-beta.1', '1.2.3-rc', 'latest']) expect(parseVersion(bad)).toBeNull()
  })

  it('ordena por número, com beta antes da final e 0.1.10 depois de 0.1.9', () => {
    expect(compareVersions(v('0.1.10-beta'), v('0.1.9-beta'))).toBeGreaterThan(0)
    expect(compareVersions(v('1.0.0-beta'), v('1.0.0'))).toBeLessThan(0)
    expect(compareVersions(v('0.2.0-beta'), v('0.1.9-beta'))).toBeGreaterThan(0)
  })

  it('acha a última tag, ignorando o que não é versão', () => {
    expect(latestVersion(['v0.1.9-beta', 'v0.1.10-beta', 'teste', 'v2'])).toBe('0.1.10-beta')
    expect(latestVersion([])).toBeNull()
  })

  it('a próxima versão é sempre o último número mais 1', () => {
    expect(nextVersion('0.1.0-beta')).toBe('0.1.1-beta')
    expect(nextVersion('0.1.9-beta')).toBe('0.1.10-beta')
    expect(nextVersion('1.0.0')).toBe('1.0.1')
  })
})

describe('versionProblem', () => {
  it('libera a próxima versão, descrita no changelog', () => {
    expect(versionProblem('0.1.1-beta', ['v0.1.0-beta'], CHANGELOG)).toBeNull()
    expect(versionProblem('0.1.0-beta', [], CHANGELOG)).toBeNull()
  })

  it('recusa formato errado, tag repetida, número pulado ou menor e falta de notas', () => {
    expect(versionProblem('latest', [], CHANGELOG)).toContain('não segue')
    expect(versionProblem('0.1.0-beta', ['v0.1.0-beta'], CHANGELOG)).toContain('já existe')
    expect(versionProblem('0.1.0-beta', ['v0.1.1-beta'], CHANGELOG)).toContain('a próxima versão é 0.1.2-beta')
    expect(versionProblem('0.1.3-beta', ['v0.1.1-beta'], CHANGELOG)).toContain('a próxima versão é 0.1.2-beta')
    expect(versionProblem('0.2.0-beta', ['v0.1.1-beta'], CHANGELOG)).toContain('a próxima versão é 0.1.2-beta')
    expect(versionProblem('0.1.2-beta', ['v0.1.1-beta'], CHANGELOG)).toContain('CHANGELOG.md não tem')
    expect(versionProblem('0.1.3-beta', ['v0.1.2-beta'], CHANGELOG)).toContain('pelo menos um destes títulos')
  })
})

describe('notesProblem', () => {
  it('aceita título conhecido com itens', () => {
    expect(notesProblem('### Melhorado\n\n- Algo.\n\n### Mudanças de quebra\n\n- Outra.')).toBeNull()
  })

  it('recusa nota sem título, título desconhecido e título vazio', () => {
    expect(notesProblem('- Algo solto.')).toContain('pelo menos um')
    expect(notesProblem('### Novidades\n\n- Algo.')).toContain('não existe')
    expect(notesProblem('### Corrigido\n\n### Melhorado\n\n- Algo.')).toContain('"Corrigido" está sem itens')
  })
})

describe('cadenceProblem', () => {
  const HOUR = 60 * 60 * 1000
  it('permite a primeira versão e a que vem depois de 24 h', () => {
    expect(cadenceProblem(null, 0, false)).toBeNull()
    expect(cadenceProblem(0, 24 * HOUR, false)).toBeNull()
  })

  it('segura antes de 24 h, salvo falha de segurança', () => {
    expect(cadenceProblem(0, 23 * HOUR, false)).toContain('faltam 1 h')
    expect(cadenceProblem(0, HOUR, true)).toBeNull()
  })
})

describe('changelogSection', () => {
  it('devolve só a seção pedida, sem confundir prefixo', () => {
    expect(changelogSection(CHANGELOG, '0.1.1-beta')).toBe('### Corrigido\n\n- Corrige algo.')
    expect(changelogSection(CHANGELOG, '0.1.1')).toBeNull()
  })
})

it('importableEntries deixa de fora curingas e o runtime de JSX', () => {
  expect(importableEntries('@a/b', { '.': './i.ts', './app': './a.ts', './vendor/*': './v/*', './jsx-runtime': './j.ts' })).toEqual(['@a/b', '@a/b/app'])
})
