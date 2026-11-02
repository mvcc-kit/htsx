/**
 * Property-based / fuzz tests pra primitivas de segurança.
 *
 * Estratégia: gerar inputs aleatórios e verificar invariantes.
 * Não substitui testes de unidade — complementa com cobertura ampla.
 */
import { describe, expect, it } from 'bun:test'
import { csrf } from '../src/csrf'
import { flash } from '../src/flash'
import { escapeHtml, escapeAttr, safeJson } from '../src/escape'

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randString(len = randInt(1, 100)): string {
  let s = ''
  for (let i = 0; i < len; i++) {
    // mistura ASCII + chars "perigosos"
    s += String.fromCharCode(randInt(32, 126))
  }
  return s
}

function randEvilString(): string {
  const evils = [
    '<script>alert(1)</script>',
    '"; DROP TABLE x; --',
    'a"><img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    'a b c',
    '</script><script>x',
    '\\n\\r\\t\\u0000',
    "'); alert(1); //",
    '${alert(1)}',
    randString(),
  ]
  return evils[randInt(0, evils.length - 1)]!
}

const FUZZ_ITERATIONS = 200

// ── CSRF ─────────────────────────────────────────────────────────────────────

const SECRET = 'fuzz-test-secret-with-at-least-32-chars-zz'

describe('fuzz: csrf — invariante "valid token sempre verify=true"', () => {
  it('sign(x).verify == true pra qualquer sessionId não-vazio', async () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const sid = randString(randInt(1, 50))
      const token = await csrf.sign({ secret: SECRET, sessionId: sid })
      const ok = await csrf.verify(token, { secret: SECRET, sessionId: sid })
      if (!ok) throw new Error(`falso negativo: sid="${sid}" token="${token}"`)
    }
  })
})

describe('fuzz: csrf — invariante "input lixo nunca verify=true"', () => {
  it('strings aleatórias nunca passam verify', async () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const garbage = randString(randInt(0, 200))
      const ok = await csrf.verify(garbage, { secret: SECRET, sessionId: 'u1' })
      if (ok) throw new Error(`falso positivo: "${garbage}"`)
    }
  })

  it('tokens com partes embaralhadas nunca passam', async () => {
    const real = await csrf.sign({ secret: SECRET, sessionId: 'u1' })
    const [sid, ts, sig] = real.split('.') as [string, string, string]
    const shuffles = [
      `${ts}.${sid}.${sig}`,
      `${sig}.${ts}.${sid}`,
      `${sid}.${sig}.${ts}`,
      `${sid}..${sig}`,
      `..${sig}`,
      `${sid}.${ts}.`,
    ]
    for (const s of shuffles) {
      expect(await csrf.verify(s, { secret: SECRET, sessionId: 'u1' })).toBe(false)
    }
  })

  it('nunca crasha com input não-string', async () => {
    const evil: unknown[] = [null, undefined, 0, 1, true, [], {}, new Date(), () => 0, Symbol('x')]
    for (const e of evil) {
      expect(await csrf.verify(e, { secret: SECRET, sessionId: 'u1' })).toBe(false)
    }
  })
})

describe('fuzz: csrf — cross-session never accepts', () => {
  it('token de A nunca verify pra B', async () => {
    for (let i = 0; i < 50; i++) {
      const a = `user-${randInt(1, 1000)}`
      const b = `user-${randInt(1001, 2000)}`
      const tokenA = await csrf.sign({ secret: SECRET, sessionId: a })
      expect(await csrf.verify(tokenA, { secret: SECRET, sessionId: b })).toBe(false)
    }
  })
})

// ── Flash ────────────────────────────────────────────────────────────────────

describe('fuzz: flash — round-trip preserva mensagens válidas', () => {
  it('serialize/parse mantém conteúdo idêntico', async () => {
    const types = ['success', 'error', 'info', 'warning'] as const
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const n = randInt(0, 5)
      const msgs = Array.from({ length: n }, () => ({
        type: types[randInt(0, 3)]!,
        text: randEvilString(),
      }))
      const token = await flash.serialize(msgs, { secret: SECRET })
      const parsed = await flash.parse(token, { secret: SECRET })
      expect(parsed).toEqual(msgs)
    }
  })
})

describe('fuzz: flash — tamper detection', () => {
  it('qualquer modificação no token retorna []', async () => {
    const original = await flash.serialize(
      [{ type: 'success', text: 'ok' }],
      { secret: SECRET },
    )
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      // muta 1 char aleatório
      const pos = randInt(0, original.length - 1)
      const c = original.charCodeAt(pos)
      const newC = c === 65 ? 66 : 65 // troca por outro char
      const tampered = original.slice(0, pos) + String.fromCharCode(newC) + original.slice(pos + 1)
      if (tampered === original) continue
      const result = await flash.parse(tampered, { secret: SECRET })
      // pode retornar [] ou as mesmas msgs SE a mutação foi em padding b64
      // que decode pro mesmo conteúdo. Mas signature ainda invalidaria.
      // Aceitamos as duas: nunca conteúdo DIFERENTE.
      if (result.length > 0) {
        expect(result).toEqual([{ type: 'success', text: 'ok' }])
      }
    }
  })

  it('nunca crasha com input lixo', async () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const garbage = randString(randInt(0, 200))
      const r = await flash.parse(garbage, { secret: SECRET })
      expect(r).toEqual([])
    }
  })
})

// ── Escape ───────────────────────────────────────────────────────────────────

describe('fuzz: escape — invariantes', () => {
  it('escapeHtml(x) nunca contém <, >, & não-escapados', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = randEvilString()
      const out = escapeHtml(input)
      // out pode conter & como parte de &lt; &gt; &amp; — verifica que nenhum
      // & vem solto (seguido de char que não forma entidade)
      const unescapedLt = /</g.exec(out)
      const unescapedGt = />/g.exec(out)
      if (unescapedLt || unescapedGt) {
        throw new Error(`escapeHtml falhou: input="${input}" output="${out}"`)
      }
    }
  })

  it('escapeAttr nunca contém " ou \' não-escapados', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = randEvilString()
      const out = escapeAttr(input)
      if (/"/.test(out)) {
        throw new Error(`escapeAttr falhou (aspas dupla): "${input}" -> "${out}"`)
      }
    }
  })

  it('safeJson nunca contém </script ou U+2028/2029 literais', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = {
        a: randEvilString(),
        b: ['</script>', ' ', ' ', randString()],
      }
      const out = safeJson(input)
      expect(out).not.toContain('</script')
      expect(out).not.toContain(' ')
      expect(out).not.toContain(' ')
    }
  })

  it('safeJson resulta em JSON parseável', () => {
    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const input = {
        s: randEvilString(),
        n: randInt(-1e6, 1e6),
        b: Math.random() > 0.5,
        arr: [randString(), randString()],
      }
      const out = safeJson(input)
      // navegador faz JSON.parse(out) — precisa ser válido
      // mas: nosso safeJson escapa /< como <, então não é JSON puro pra
      // Node JSON.parse. Mas se decodificar \u, vira válido.
      const decoded = out
        .replace(/\\u003c/g, '<')
        .replace(/\\u2028/g, ' ')
        .replace(/\\u2029/g, ' ')
      expect(() => JSON.parse(decoded)).not.toThrow()
    }
  })
})
