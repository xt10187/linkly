import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { listarRecientes, MINUTOS_POR_DEFECTO } from '../src/domain/recientes.js'
import { crearMemoriaRepo } from '../src/repos/memoriaRepo.js'
import type { Link, LinkRepo } from '../src/domain/acortar.js'

const NUM_RUNS = 100

// ---- Helpers de generación ---------------------------------------------------

/** Crea un repo en memoria ya poblado con los links dados. */
async function repoCon(links: Link[]): Promise<LinkRepo> {
  const repo = crearMemoriaRepo()
  for (const l of links) await repo.guardar(l)
  return repo
}

/**
 * Generador de una lista de Link con `slug` únicos, `url` arbitrarias, `clicks >= 0`
 * y `createdAt` ISO de instantes alrededor de `now` (dentro, fuera y justo en los
 * bordes `now` y `now - minutos·60000`), dado un `now` y `minutos` concretos.
 */
function linksArb(now: number, minutos: number) {
  const desde = now - minutos * 60_000
  // offsets relativos a la ventana, incluyendo los bordes exactos.
  const offsetArb = fc.oneof(
    fc.constant(now), // borde superior exacto
    fc.constant(desde), // borde inferior exacto
    fc.constant(now + 1), // justo fuera por arriba
    fc.constant(desde - 1), // justo fuera por abajo
    fc.integer({ min: desde - 5 * 60_000, max: now + 5 * 60_000 }), // alrededor
  )
  return fc
    .uniqueArray(
      fc.record({
        slug: fc.string({ minLength: 1, maxLength: 8 }),
        url: fc.webUrl(),
        clicks: fc.nat(),
        instante: offsetArb,
      }),
      { selector: (r) => r.slug, maxLength: 30 },
    )
    .map((rows) =>
      rows.map<Link>((r) => ({
        slug: r.slug,
        url: r.url,
        clicks: r.clicks,
        createdAt: new Date(r.instante).toISOString(),
      })),
    )
}

// `now` acotado a un rango razonable y `minutos` válido (1–1440).
const nowArb = fc.integer({ min: Date.parse('2000-01-01T00:00:00.000Z'), max: Date.parse('2100-01-01T00:00:00.000Z') })
const minutosArb = fc.integer({ min: 1, max: 1440 })

// ---- Property tests ----------------------------------------------------------

describe('listarRecientes — property tests', () => {
  // Feature: links-ultima-hora, Property 1: Correspondencia exacta con la ventana
  // Validates: Requirements 1.1, 1.2, 1.3, 1.4, 4.3
  it('Property 1: el resultado es exactamente los links dentro de [now-min, now]', async () => {
    await fc.assert(
      fc.asyncProperty(nowArb, minutosArb, async (now, minutos) => {
        await fc.assert(
          fc.asyncProperty(linksArb(now, minutos), async (links) => {
            const repo = await repoCon(links)
            const res = await listarRecientes(repo, { now, minutos })
            const desde = now - minutos * 60_000
            const esperados = new Set(
              links
                .filter((l) => {
                  const t = Date.parse(l.createdAt)
                  return desde <= t && t <= now
                })
                .map((l) => l.slug),
            )
            const obtenidos = new Set(res.map((l) => l.slug))
            expect(obtenidos).toEqual(esperados)
          }),
          { numRuns: 5 },
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: links-ultima-hora, Property 2: Orden total determinista (createdAt desc, slug asc)
  // Validates: Requirements 2.1, 2.2, 2.3
  it('Property 2: pares adyacentes cumplen createdAt desc y slug asc en empate', async () => {
    await fc.assert(
      fc.asyncProperty(nowArb, minutosArb, async (now, minutos) => {
        await fc.assert(
          fc.asyncProperty(linksArb(now, minutos), async (links) => {
            const repo = await repoCon(links)
            const res = await listarRecientes(repo, { now, minutos })
            for (let i = 0; i + 1 < res.length; i++) {
              const ta = Date.parse(res[i].createdAt)
              const tb = Date.parse(res[i + 1].createdAt)
              expect(ta).toBeGreaterThanOrEqual(tb)
              if (ta === tb) {
                expect(res[i].slug < res[i + 1].slug).toBe(true)
              }
            }
          }),
          { numRuns: 5 },
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: links-ultima-hora, Property 3: El resultado es una permutación de un subconjunto del repositorio
  // Validates: Requirements 1.2
  it('Property 3: cada elemento es idéntico a uno del repo, sin duplicados, sin mutar el repo', async () => {
    await fc.assert(
      fc.asyncProperty(nowArb, minutosArb, async (now, minutos) => {
        await fc.assert(
          fc.asyncProperty(linksArb(now, minutos), async (links) => {
            const repo = await repoCon(links)
            const antes = JSON.stringify(await repo.listar())
            const res = await listarRecientes(repo, { now, minutos })

            const porSlug = new Map(links.map((l) => [l.slug, l]))
            for (const l of res) {
              const orig = porSlug.get(l.slug)
              expect(orig).toBeDefined()
              expect(l).toEqual(orig)
            }
            // sin slugs duplicados
            expect(new Set(res.map((l) => l.slug)).size).toBe(res.length)
            // el repo no se modifica
            expect(JSON.stringify(await repo.listar())).toBe(antes)
          }),
          { numRuns: 5 },
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: links-ultima-hora, Property 4: Ventana por defecto de 60 minutos
  // Validates: Requirements 4.2
  it('Property 4: sin minutos equivale a minutos = 60', async () => {
    await fc.assert(
      fc.asyncProperty(nowArb, async (now) => {
        await fc.assert(
          fc.asyncProperty(linksArb(now, MINUTOS_POR_DEFECTO), async (links) => {
            const repo = await repoCon(links)
            const sinMinutos = await listarRecientes(repo, { now })
            const con60 = await listarRecientes(repo, { now, minutos: 60 })
            expect(sinMinutos).toEqual(con60)
          }),
          { numRuns: 5 },
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })

  // Feature: links-ultima-hora, Property 5: Monotonicidad respecto al tamaño de la ventana
  // Validates: Requirements 4.3
  it('Property 5: m1 <= m2 ⇒ resultado(m1) es subconjunto de resultado(m2)', async () => {
    await fc.assert(
      fc.asyncProperty(nowArb, minutosArb, minutosArb, async (now, a, b) => {
        const m1 = Math.min(a, b)
        const m2 = Math.max(a, b)
        await fc.assert(
          fc.asyncProperty(linksArb(now, m2), async (links) => {
            const repo = await repoCon(links)
            const r1 = new Set((await listarRecientes(repo, { now, minutos: m1 })).map((l) => l.slug))
            const r2 = new Set((await listarRecientes(repo, { now, minutos: m2 })).map((l) => l.slug))
            for (const s of r1) expect(r2.has(s)).toBe(true)
          }),
          { numRuns: 5 },
        )
      }),
      { numRuns: NUM_RUNS },
    )
  })
})

// ---- Unit tests (ejemplos y casos borde) ------------------------------------

describe('listarRecientes — unit tests', () => {
  const now = Date.parse('2024-06-01T12:00:00.000Z')
  const iso = (ms: number) => new Date(ms).toISOString()
  const link = (slug: string, ms: number): Link => ({ slug, url: `https://ej.com/${slug}`, clicks: 0, createdAt: iso(ms) })

  it('repo vacío devuelve [] (R3.1)', async () => {
    const repo = crearMemoriaRepo()
    expect(await listarRecientes(repo, { now })).toEqual([])
  })

  it('todos fuera de ventana devuelve [] (R3.1)', async () => {
    const repo = await repoCon([
      link('a', now - 61 * 60_000),
      link('b', now + 1),
    ])
    expect(await listarRecientes(repo, { now, minutos: 60 })).toEqual([])
  })

  it('0 y 1 elemento se devuelven con la longitud esperada (R2.3)', async () => {
    const vacio = crearMemoriaRepo()
    expect(await listarRecientes(vacio, { now })).toHaveLength(0)
    const uno = await repoCon([link('solo', now - 10 * 60_000)])
    const res = await listarRecientes(uno, { now, minutos: 60 })
    expect(res).toHaveLength(1)
    expect(res[0].slug).toBe('solo')
  })

  it('incluye los bordes exactos now y now - minutos·60000 (R1.4)', async () => {
    const repo = await repoCon([
      link('sup', now),
      link('inf', now - 60 * 60_000),
    ])
    const res = await listarRecientes(repo, { now, minutos: 60 })
    expect(res.map((l) => l.slug).sort()).toEqual(['inf', 'sup'])
  })

  it('empate de createdAt se ordena por slug ascendente (R2.2)', async () => {
    const t = now - 5 * 60_000
    const repo = await repoCon([link('c', t), link('a', t), link('b', t)])
    const res = await listarRecientes(repo, { now, minutos: 60 })
    expect(res.map((l) => l.slug)).toEqual(['a', 'b', 'c'])
  })

  it('ordena por createdAt descendente (más reciente primero) (R2.1)', async () => {
    const repo = await repoCon([
      link('viejo', now - 50 * 60_000),
      link('nuevo', now - 1 * 60_000),
      link('medio', now - 25 * 60_000),
    ])
    const res = await listarRecientes(repo, { now, minutos: 60 })
    expect(res.map((l) => l.slug)).toEqual(['nuevo', 'medio', 'viejo'])
  })
})
