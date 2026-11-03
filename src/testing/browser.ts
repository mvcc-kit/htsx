// Navegador real pelo Chrome DevTools Protocol, com o WebSocket nativo do Bun.
// Sem Playwright nem Puppeteer: usa o Chrome ou Chromium já instalado na máquina.
//
// Seletores: `text:Enviar` (elemento visível mais interno com esse texto), `id:email`,
// `testid:enviar` (data-testid) ou CSS comum. Toda espera é por condição, sem sleep.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

type Handler = (req: Request) => Response | Promise<Response>

export interface OpenOpts {
  /** Caminho do Chrome/Chromium. Padrão: `CHROME_PATH` ou os caminhos comuns. */
  chrome?: string
  /** Tempo máximo de cada espera, em ms. Padrão 5000. */
  timeout?: number
  /** Tamanho da janela. Padrão 1280×800. */
  viewport?: { width: number; height: number }
}

export interface InspectResult {
  url: string
  stores: Record<string, unknown>
  data: Record<string, unknown>
}

export interface App {
  /** URL base do servidor de teste (ex.: `http://127.0.0.1:1234`). */
  readonly origin: string
  goto(pathname: string): Promise<void>
  /** Foca o campo e digita (dispara `input`, como um usuário). */
  type(selector: string, text: string): Promise<void>
  /** Clica no centro do elemento com o mouse. */
  press(selector: string): Promise<void>
  /** Espera o elemento existir e estar visível. */
  waitFor(selector: string, opts?: { timeout?: number }): Promise<void>
  /** Texto visível do elemento, ou `null`. */
  text(selector: string): Promise<string | null>
  /** Estado do Alpine via `window.__htsx.inspect()` (precisa de `inspector()` na página). */
  inspect(): Promise<InspectResult>
  /** Altera estado via `window.__htsx.set(caminho, valor)`. */
  set(path: string, value: unknown): Promise<void>
  /** Avalia uma expressão JS na página e devolve o valor (serializável). */
  evaluate<T = unknown>(expression: string): Promise<T>
  /** Salva PNG da página. */
  screenshot(file: string): Promise<void>
  close(): Promise<void>
}

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** Caminho do Chrome encontrado, ou `null`. Use para pular testes onde não houver navegador. */
export function findChrome(explicit?: string): string | null {
  const env = process.env.CHROME_PATH
  for (const p of [explicit, env, ...CHROME_CANDIDATES]) {
    if (p && Bun.file(p).size > 0) return p
  }
  return null
}

// Funções que rodam na página. `find` resolve os seletores; `visible` filtra o que o usuário vê.
const PAGE_HELPERS = `
const visible = el => !!(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
const find = sel => {
  if (sel.startsWith('id:')) return document.getElementById(sel.slice(3));
  if (sel.startsWith('testid:')) return document.querySelector('[data-testid="' + CSS.escape(sel.slice(7)) + '"]');
  if (sel.startsWith('text:')) {
    const want = sel.slice(5).trim();
    const has = el => visible(el) && !!el.innerText && el.innerText.includes(want);
    for (const el of document.body.querySelectorAll('*')) {
      if (has(el) && ![...el.children].some(has)) return el;
    }
    return null;
  }
  return document.querySelector(sel);
};`

class Cdp {
  private id = 0
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private listeners = new Set<(msg: any) => void>()

  constructor(private ws: WebSocket) {
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(String(ev.data))
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) p?.reject(new Error(`CDP: ${msg.error.message}`))
        else p?.resolve(msg.result)
      } else {
        for (const l of this.listeners) l(msg)
      }
    })
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error(`htsx: não conectou ao Chrome em ${url}`)), { once: true })
    })
    return new Cdp(ws)
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  once(method: string, sessionId: string): Promise<any> {
    return new Promise(resolve => {
      const l = (msg: any) => {
        if (msg.method === method && msg.sessionId === sessionId) { this.listeners.delete(l); resolve(msg.params) }
      }
      this.listeners.add(l)
    })
  }

  close() { this.ws.close() }
}

async function launchChrome(chrome: string, userDataDir: string, viewport: { width: number; height: number }) {
  const proc = Bun.spawn({
    cmd: [
      chrome, '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--disable-gpu', '--disable-dev-shm-usage', '--remote-debugging-port=0',
      '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only',
      `--user-data-dir=${userDataDir}`, `--window-size=${viewport.width},${viewport.height}`, 'about:blank',
    ],
    stdout: 'ignore',
    stderr: 'pipe',
  })
  // O Chrome imprime "DevTools listening on ws://..." no stderr quando está pronto.
  const reader = proc.stderr.getReader()
  const decoder = new TextDecoder()
  let log = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`htsx: o Chrome fechou antes de abrir o DevTools:\n${log}`)
    log += decoder.decode(value)
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(log)
    if (m) { reader.releaseLock(); return { proc, wsUrl: m[1]! } }
  }
}

/** Sobe `handler` num servidor local, abre o Chrome em `pathname` e devolve o controle da página. */
export async function open(handler: Handler, pathname = '/', opts: OpenOpts = {}): Promise<App> {
  const chrome = findChrome(opts.chrome)
  if (!chrome) throw new Error('htsx: Chrome não encontrado; instale o Chrome/Chromium ou defina CHROME_PATH')
  const timeout = opts.timeout ?? 5000
  const viewport = opts.viewport ?? { width: 1280, height: 800 }

  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler })
  const origin = `http://127.0.0.1:${server.port}`
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'htsx-chrome-'))
  const { proc, wsUrl } = await launchChrome(chrome, userDataDir, viewport)
  const cdp = await Cdp.connect(wsUrl)

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method: string, params: object = {}) => cdp.send(method, params, sessionId)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: false })

  async function evaluate<T>(expression: string): Promise<T> {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) {
      const desc = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text
      throw new Error(String(desc).split('\n')[0])
    }
    return r.result.value as T
  }

  // Executa `body` na página com `find`, `visible` e `sel` (o seletor) disponíveis.
  const inPage = <T>(sel: string, body: string) =>
    evaluate<T>(`(async () => { ${PAGE_HELPERS} const sel = ${JSON.stringify(sel)}; ${body} })()`)

  /** Durante uma transição de página, o navegador engole os cliques. */
  async function settled() {
    const deadline = Date.now() + timeout
    // as animações só existem depois do próximo quadro: antes disso, a checagem não veria a transição
    const running = () => evaluate<boolean>(`new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.getAnimations().some(a => String(a.effect?.pseudoElement).startsWith('::view-transition'))))))`)
    while (await running()) {
      if (Date.now() > deadline) throw new Error('press: a transição de página não terminou')
      await Bun.sleep(10)
    }
  }

  async function waitFor(selector: string, o: { timeout?: number } = {}) {
    const ms = o.timeout ?? timeout
    await inPage<void>(selector, `
      const ok = () => { const el = find(sel); return el && visible(el) };
      if (ok()) return;
      await new Promise((resolve, reject) => {
        const obs = new MutationObserver(() => { if (ok()) { obs.disconnect(); clearTimeout(t); resolve() } });
        obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
        const t = setTimeout(() => { obs.disconnect(); reject(new Error('htsx: ' + JSON.stringify(sel) + ' não apareceu em ${ms}ms')) }, ${ms});
      });`)
  }

  async function goto(p: string) {
    const loaded = cdp.once('Page.loadEventFired', sessionId)
    await send('Page.navigate', { url: origin + p })
    await loaded
  }

  await goto(pathname)

  return {
    origin,
    goto,
    waitFor,
    evaluate,
    async type(selector, text) {
      await waitFor(selector)
      await inPage(selector, `const el = find(sel); el.focus(); if ('value' in el) el.value = '';`)
      await send('Input.insertText', { text })
    },
    async press(selector) {
      await waitFor(selector)
      await settled()
      const box = await inPage<{ x: number; y: number }>(selector, `
        const el = find(sel); el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`)
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 })
      }
    },
    text: selector => inPage<string | null>(selector, `const el = find(sel); return el ? el.innerText.trim() : null;`),
    inspect: () => evaluate<InspectResult>(
      `window.__htsx ? window.__htsx.inspect() : (() => { throw new Error('htsx: window.__htsx não existe; inclua inspector() no <head> da página') })()`),
    async set(p, value) {
      await evaluate(`window.__htsx.set(${JSON.stringify(p)}, ${JSON.stringify(value)})`)
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      await Bun.write(file, Buffer.from(data, 'base64'))
    },
    async close() {
      cdp.close()
      proc.kill()
      await proc.exited
      server.stop(true)
      await rm(userDataDir, { recursive: true, force: true })
    },
  }
}
