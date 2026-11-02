#!/usr/bin/env bun
// Documentação com uma fonte só: SKILL.md gera llms.txt.
// Uso: bun run docs   (o teste __tests__/docs.test.ts falha se llms.txt estiver desatualizado)
import path from 'node:path'

const ROOT = path.join(import.meta.dir, '..')

/** llms.txt = SKILL.md sem o frontmatter, com aviso de arquivo gerado. */
export function llmsFromSkill(skill: string): string {
  const body = skill.replace(/^---\n[\s\S]*?\n---\n+/, '')
  return `<!-- Gerado de SKILL.md por \`bun run docs\`. Não edite aqui. -->\n\n${body}`
}

/** Blocos ```ts e ```tsx de um markdown, com a linha onde começam. */
export function codeBlocks(md: string): Array<{ lang: 'ts' | 'tsx'; line: number; code: string }> {
  const blocks: Array<{ lang: 'ts' | 'tsx'; line: number; code: string }> = []
  const re = /^```(tsx?)\n([\s\S]*?)^```$/gm
  for (const m of md.matchAll(re)) {
    blocks.push({ lang: m[1] as 'ts' | 'tsx', line: md.slice(0, m.index).split('\n').length, code: m[2]! })
  }
  return blocks
}

if (import.meta.main) {
  const skill = await Bun.file(path.join(ROOT, 'SKILL.md')).text()
  await Bun.write(path.join(ROOT, 'llms.txt'), llmsFromSkill(skill))
  console.log('llms.txt gerado de SKILL.md')
}
