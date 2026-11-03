import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ASSETS_PATH, fingerprintAssets } from '../src/build/fingerprint'

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
