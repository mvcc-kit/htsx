#!/usr/bin/env bun
// build.ts — Gera dist/ para npm publish. Nenhuma dependência extra necessária.

import { rm, mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'

// ==========================================
// CONFIGURAÇÃO — edite aqui antes de publicar
// ==========================================
const CONFIG = {
  name: 'htsx',
  version: '0.1.0',
  description: 'Zero-dependency JSX SSR renderer for HTMX + Alpine.js. Works on Bun, Node 18+, Cloudflare Workers.',
  author: '',
  license: 'MIT',
  keywords: ['htmx', 'alpine', 'jsx', 'ssr', 'cloudflare-workers', 'bun', 'hono', 'typescript'],
  repository: '', // preencha antes de publicar

  distDir: 'dist',
  target: 'node' as const,

  // Arquivos extras a copiar (se existirem)
  extraFiles: ['README.md', 'LICENSE'],
}

// Entrypoints fixos: { arquivo fonte → export key }
// index.ts       → exports["."]
// src/jsx-runtime → exports["./jsx-runtime"]
const ENTRYPOINTS: Record<string, string> = {
  'index.ts': '.',
  'src/jsx-runtime.ts': './jsx-runtime',
}

// ==========================================
// BUILD STEPS
// ==========================================

async function clean() {
  console.log(`🧹 Limpando ${CONFIG.distDir}/...`)
  await rm(CONFIG.distDir, { recursive: true, force: true })
  await mkdir(CONFIG.distDir, { recursive: true })
}

async function copyExtraFiles() {
  console.log('\n📄 Copiando arquivos extras...')
  for (const file of CONFIG.extraFiles) {
    if (await Bun.file(file).exists()) {
      await copyFile(file, path.join(CONFIG.distDir, file))
      console.log(`   ✅ ${file}`)
    }
  }
}

async function copyVendor() {
  console.log('\n📦 Copiando vendor/ (Alpine e htmx fixados)...')
  await mkdir(path.join(CONFIG.distDir, 'vendor'), { recursive: true })
  for await (const f of new Bun.Glob('*.{js,json}').scan({ cwd: 'vendor' })) {
    await copyFile(path.join('vendor', f), path.join(CONFIG.distDir, 'vendor', f))
  }
}

async function buildJS() {
  console.log('\n🔨 Compilando JavaScript (Bun.build)...')

  const result = await Bun.build({
    entrypoints: Object.keys(ENTRYPOINTS),
    outdir: CONFIG.distDir,
    target: CONFIG.target,
    format: 'esm',
    minify: true,
    splitting: false,
    // Sem dependências de runtime — nada a marcar como external
  })

  if (!result.success) {
    console.error(result.logs)
    throw new Error('Bun.build() falhou')
  }

  // Bun.build preserva estrutura de diretório:
  //   src/jsx-runtime.ts → dist/src/jsx-runtime.js
  // Precisa estar também em dist/jsx-runtime.js para o export ./jsx-runtime
  const nested = path.join(CONFIG.distDir, 'src', 'jsx-runtime.js')
  if (await Bun.file(nested).exists()) {
    await Bun.write(
      path.join(CONFIG.distDir, 'jsx-runtime.js'),
      await Bun.file(nested).text(),
    )
  }

  console.log('✅ JavaScript compilado')
}

async function buildDeclarations() {
  console.log('\n📝 Gerando declarações TypeScript...')

  const glob = new Bun.Glob('src/**/*.ts')
  const srcFiles: string[] = []
  for await (const f of glob.scan({ cwd: '.' })) {
    if (!f.includes('.test.') && !f.includes('.spec.')) srcFiles.push(f)
  }

  const proc = Bun.spawn({
    cmd: [
      'bun', 'tsc',
      '--declaration',
      '--emitDeclarationOnly',
      '--outDir', CONFIG.distDir,
      '--rootDir', '.',
      '--module', 'ESNext',
      '--moduleResolution', 'bundler',
      '--target', 'ESNext',
      '--lib', 'ESNext,DOM',
      '--strict',
      '--skipLibCheck',
      '--resolveJsonModule',
      'index.ts',
      ...srcFiles,
    ],
    stdout: 'inherit',
    stderr: 'inherit',
  })

  if (await proc.exited !== 0) {
    throw new Error('tsc falhou ao gerar declarações')
  }

  // src/jsx-runtime.d.ts → também em dist/jsx-runtime.d.ts (para o export ./jsx-runtime)
  const nestedDts = path.join(CONFIG.distDir, 'src', 'jsx-runtime.d.ts')
  if (await Bun.file(nestedDts).exists()) {
    await Bun.write(
      path.join(CONFIG.distDir, 'jsx-runtime.d.ts'),
      await Bun.file(nestedDts).text(),
    )
  }

  // Copia jsx.d.ts da raiz — tipos globais JSX (namespace JSX) para consumidores
  if (await Bun.file('jsx.d.ts').exists()) {
    await copyFile('jsx.d.ts', path.join(CONFIG.distDir, 'jsx.d.ts'))
  }

  console.log('✅ Declarações geradas')
}

async function generatePackageJson() {
  console.log('\n📋 Gerando package.json do dist...')

  const pkg = {
    name: CONFIG.name,
    version: CONFIG.version,
    description: CONFIG.description,
    type: 'module',
    main: './index.js',
    types: './index.d.ts',
    exports: {
      '.': {
        types: './index.d.ts',
        import: './index.js',
        default: './index.js',
      },
      './jsx-runtime': {
        types: './jsx-runtime.d.ts',
        import: './jsx-runtime.js',
        default: './jsx-runtime.js',
      },
      // tsx usa jsx-dev-runtime em modo dev — aponta para o mesmo arquivo
      './vendor/*': './vendor/*',
      './jsx-dev-runtime': {
        types: './jsx-runtime.d.ts',
        import: './jsx-runtime.js',
        default: './jsx-runtime.js',
      },
    },
    // Somente esses padrões vão para o pacote publicado
    files: ['**/*.js', '**/*.d.ts', 'vendor/pins.json', 'README.md', 'LICENSE', 'llms.txt', 'SKILL.md'],
    keywords: [...CONFIG.keywords],
    ...(CONFIG.author ? { author: CONFIG.author } : {}),
    license: CONFIG.license,
    ...(CONFIG.repository ? { repository: { type: 'git', url: CONFIG.repository } } : {}),
    engines: { node: '>=18', bun: '>=1.0' },
    sideEffects: false,
  }

  await Bun.write(
    path.join(CONFIG.distDir, 'package.json'),
    JSON.stringify(pkg, null, 2),
  )

  console.log('✅ package.json gerado')
}

async function generateLlmsTxt() {
  console.log('\n🤖 Gerando llms.txt...')

  // Lê o arquivo estático e injeta o nome do pacote no lugar do placeholder {{PKG}}
  const template = await Bun.file('llms.txt').text()
  const content = template.replaceAll('{{PKG}}', CONFIG.name)

  await Bun.write(path.join(CONFIG.distDir, 'llms.txt'), content)
  console.log('✅ llms.txt gerado')
}

async function generateSkill() {
  console.log('\n🧠 Gerando skill...')

  const template = await Bun.file('SKILL.md').text()

  // dist/SKILL.md → nome público do pacote (para quem instala do npm)
  await Bun.write(
    path.join(CONFIG.distDir, 'SKILL.md'),
    template.replaceAll('{{PKG}}', CONFIG.name),
  )

  // .claude/skills/htsx/SKILL.md → nome workspace (para dev local)
  await Bun.write(
    path.join('..', '..', '.claude', 'skills', 'htsx', 'SKILL.md'),
    template.replaceAll('{{PKG}}', '@repo/htsx'),
  )

  console.log('✅ skill gerada (dist/ + .claude/skills/htsx/)')
}

async function printSummary() {
  console.log(`\n📁 Conteúdo de ${CONFIG.distDir}/:\n`)
  const glob = new Bun.Glob('**/*')
  const files: string[] = []
  for await (const f of glob.scan({ cwd: CONFIG.distDir })) files.push(f)
  files.sort().forEach(f => console.log(`   ${f}`))
  console.log(`\n💡 Para publicar:\n   cd ${CONFIG.distDir} && npm publish --access public`)
}

async function main() {
  console.log(`🚀 Build: ${CONFIG.name}@${CONFIG.version}\n`)
  await clean()
  await copyExtraFiles()
  await copyVendor()
  await buildJS()
  await buildDeclarations()
  await generatePackageJson()
  await generateLlmsTxt()
  await generateSkill()
  await printSummary()
  console.log('\n✅ Build completo!')
}

main().catch(err => {
  console.error('\n❌ Build falhou:', err)
  process.exit(1)
})
