import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ASSETS_PATH, fingerprintAssets, inlineStyles } from '../src/build/fingerprint'

let dir = ''
const write = (file: string, text: string) => Bun.write(path.join(dir, file), text)
const read = (file: string) => Bun.file(path.join(dir, file)).text()

async function setup() {
  dir = await mkdtemp(path.join(tmpdir(), 'htsx-fingerprint-'))
  await write('styles.css', 'a{}')
  await write('support.js', 'one()')
  await write('index.html', '<link rel="stylesheet" href="/styles.css"><script src="/support.js"></script><a href="/support.js.txt">x</a>')
  await write('_htsx/partial/page.html', '<script src="/support.js"></script><p>/styles.css</p>')
}

afterEach(() => rm(dir, { recursive: true, force: true }))

describe('fingerprintAssets', () => {
  it('move para a pasta com hash e troca href e src, parciais inclusive', async () => {
    await setup()
    const map = await fingerprintAssets(dir, ['/styles.css', '/support.js'])
    expect(map['/styles.css']).toMatch(new RegExp(`^${ASSETS_PATH}/styles\\.[0-9a-f]{12}\\.css$`))
    expect(await read(map['/styles.css']!)).toBe('a{}')
    expect(await Bun.file(path.join(dir, 'styles.css')).exists()).toBe(false)
    const index = await read('index.html')
    expect(index).toContain(`href="${map['/styles.css']}"`)
    expect(index).toContain(`src="${map['/support.js']}"`)
    expect(await read('_htsx/partial/page.html')).toContain(`src="${map['/support.js']}"`)
  })

  it('não troca nome parecido nem texto da página', async () => {
    await setup()
    await fingerprintAssets(dir, ['/styles.css', '/support.js'])
    expect(await read('index.html')).toContain('href="/support.js.txt"')
    expect(await read('_htsx/partial/page.html')).toContain('<p>/styles.css</p>')
  })

  it('o nome muda só quando o conteúdo muda', async () => {
    await setup()
    const first = await fingerprintAssets(dir, ['/styles.css'])
    await rm(dir, { recursive: true, force: true })
    await setup()
    expect(await fingerprintAssets(dir, ['/styles.css'])).toEqual(first)
    await rm(dir, { recursive: true, force: true })
    await setup()
    await write('styles.css', 'b{}')
    expect(await fingerprintAssets(dir, ['/styles.css'])).not.toEqual(first)
  })

  it('recusa arquivo ausente e caminho fora da saída', async () => {
    await setup()
    await expect(fingerprintAssets(dir, ['/nao-existe.css'])).rejects.toThrow('não achou')
    await expect(fingerprintAssets(dir, ['/../fora.css'])).rejects.toThrow('dentro da saída')
    await expect(fingerprintAssets(dir, ['styles.css'])).rejects.toThrow('caminho da raiz')
  })
})

describe('inlineStyles', () => {
  it('troca o link pelo CSS, apaga o arquivo e devolve o hash da CSP', async () => {
    await setup()
    const { cspHashes } = await inlineStyles(dir, ['/styles.css'])
    expect(await read('index.html')).toContain('<style>a{}</style><script src="/support.js">')
    expect(await read('index.html')).not.toContain('href="/styles.css"')
    expect(await Bun.file(path.join(dir, 'styles.css')).exists()).toBe(false)
    const expected = new Bun.CryptoHasher('sha256').update('a{}').digest('base64')
    expect(cspHashes).toEqual([`'sha256-${expected}'`])
  })

  it('não mexe em texto da página nem em outro link', async () => {
    await setup()
    await inlineStyles(dir, ['/styles.css'])
    expect(await read('_htsx/partial/page.html')).toContain('<p>/styles.css</p>')
    expect(await read('index.html')).toContain('href="/support.js.txt"')
  })

  it('recusa CSS que fecharia a tag, sem alterar nada', async () => {
    await setup()
    await write('styles.css', 'a{}</style><script>x</script>')
    await expect(inlineStyles(dir, ['/styles.css'])).rejects.toThrow('contém </style')
    expect(await read('index.html')).toContain('href="/styles.css"')
  })

  it('recusa arquivo ausente e caminho fora da saída', async () => {
    await setup()
    await expect(inlineStyles(dir, ['/nao-existe.css'])).rejects.toThrow('não achou')
    await expect(inlineStyles(dir, ['/../fora.css'])).rejects.toThrow('dentro da saída')
  })
})

describe('fingerprintAssets: arquivo que ninguém cita', () => {
  it('recusa antes de mover qualquer coisa', async () => {
    await setup()
    await write('solto.js', 'x()')
    await expect(fingerprintAssets(dir, ['/support.js', '/solto.js'])).rejects.toThrow('/solto.js')
    expect(await Bun.file(path.join(dir, 'support.js')).exists()).toBe(true)
    expect(await read('index.html')).toContain('src="/support.js"')
  })
})

describe('inlineStyles: o que muda ao sair do arquivo', () => {
  it('mantém o media do link', async () => {
    await setup()
    await write('print.css', 'b{}')
    await write('index.html', '<link rel="stylesheet" media="print" href="/print.css">')
    await inlineStyles(dir, ['/print.css'])
    expect(await read('index.html')).toBe('<style media="print">b{}</style>')
  })

  it('recusa endereço relativo no CSS: dentro do HTML, ele passaria a valer a partir da página', async () => {
    for (const css of ['a{background:url(x.png)}', "a{background:url( '../x.png' )}", '@import "b.css";', '@import url(b.css);']) {
      await setup()
      await write('styles.css', css)
      await expect(inlineStyles(dir, ['/styles.css'])).rejects.toThrow('relativo')
      expect(await Bun.file(path.join(dir, 'styles.css')).exists()).toBe(true)
    }
  })

  it('aceita endereço absoluto, data e comentário', async () => {
    await setup()
    await write('styles.css', '/* url(x.png) */a{background:url(/x.png)}b{background:url("https://c.d/e.png")}i{background:url(data:image/png;base64,AA)}u{fill:url(#g)}@import url(/b.css);')
    await inlineStyles(dir, ['/styles.css'])
    expect(await read('index.html')).toContain('<style>/* url(x.png) */')
  })

  it('recusa CSS que nenhuma página cita, sem apagar nem alterar nada', async () => {
    await setup()
    await write('solto.css', 'c{}')
    await expect(inlineStyles(dir, ['/styles.css', '/solto.css'])).rejects.toThrow('/solto.css')
    expect(await Bun.file(path.join(dir, 'solto.css')).exists()).toBe(true)
    expect(await read('index.html')).toContain('href="/styles.css"')
  })
})
