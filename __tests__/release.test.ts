import { describe, expect, it } from 'bun:test'
import { changelogSection, compareVersions, importableEntries, latestVersion, parseVersion, versionProblem } from '../scripts/release.logic'

const v = (text: string) => parseVersion(text)!
const CHANGELOG = '# Changelog\n\n## 0.1.0-beta.2 (03/11/2026)\n\n- Corrige algo.\n\n## 0.1.0-beta.1 (02/11/2026)\n\n- Primeira.\n\n## 0.0.9\n\n'

describe('versões', () => {
  it('aceita X.Y.Z e X.Y.Z-beta.N; recusa o resto', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, beta: null })
    expect(parseVersion('0.1.0-beta.2')?.beta).toBe(2)
    for (const bad of ['v1.2.3', '1.2', '1.2.3-beta', '1.2.3-beta.0', '1.2.3-rc.1', 'latest']) expect(parseVersion(bad)).toBeNull()
  })

  it('ordena por número, com beta antes da final e beta.10 depois de beta.9', () => {
    expect(compareVersions(v('0.1.0-beta.10'), v('0.1.0-beta.9'))).toBeGreaterThan(0)
    expect(compareVersions(v('1.0.0-beta.1'), v('1.0.0'))).toBeLessThan(0)
    expect(compareVersions(v('0.2.0-beta.1'), v('0.1.0'))).toBeGreaterThan(0)
  })

  it('acha a última tag, ignorando o que não é versão', () => {
    expect(latestVersion(['v0.1.0-beta.9', 'v0.1.0-beta.10', 'teste', 'v2'])).toBe('0.1.0-beta.10')
    expect(latestVersion([])).toBeNull()
  })
})

describe('versionProblem', () => {
  it('libera versão nova, maior e descrita no changelog', () => {
    expect(versionProblem('0.1.0-beta.2', ['v0.1.0-beta.1'], CHANGELOG)).toBeNull()
    expect(versionProblem('0.1.0-beta.1', [], CHANGELOG)).toBeNull()
  })

  it('recusa formato errado, tag repetida, versão menor e falta de changelog', () => {
    expect(versionProblem('latest', [], CHANGELOG)).toContain('não segue')
    expect(versionProblem('0.1.0-beta.1', ['v0.1.0-beta.1'], CHANGELOG)).toContain('já existe')
    expect(versionProblem('0.1.0-beta.1', ['v0.1.0-beta.2'], CHANGELOG)).toContain('não é maior')
    expect(versionProblem('0.1.0-beta.3', ['v0.1.0-beta.2'], CHANGELOG)).toContain('CHANGELOG.md não tem')
    expect(versionProblem('0.0.9', [], CHANGELOG)).toContain('CHANGELOG.md não tem')
  })
})

describe('changelogSection', () => {
  it('devolve só a seção pedida, sem confundir prefixo', () => {
    expect(changelogSection(CHANGELOG, '0.1.0-beta.2')).toBe('- Corrige algo.')
    expect(changelogSection(CHANGELOG, '0.1.0-beta')).toBeNull()
  })
})

it('importableEntries deixa de fora curingas e o runtime de JSX', () => {
  expect(importableEntries('@a/b', { '.': './i.ts', './app': './a.ts', './vendor/*': './v/*', './jsx-runtime': './j.ts' })).toEqual(['@a/b', '@a/b/app'])
})
