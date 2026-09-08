import { describe, it, expect } from 'vitest'
import { crearApp } from '../src/app.js'
import { crearMemoriaRepo } from '../src/repos/memoriaRepo.js'
import type { Link, LinkRepo } from '../src/domain/acortar.js'

async function repoCon(links: Link[]): Promise<LinkRepo> {
  const repo = crearMemoriaRepo()
  for (const l of links) await repo.guardar(l)
  return repo
}

describe('GET /api/links/recientes — validación y contrato HTTP', () => {
  it('sin minutos → 200 y el body es un array JSON (R3.2, R4.2)', async () => {
    const repo = await repoCon([
      { slug: 'reciente', url: 'https://ej.com', clicks: 0, createdAt: new Date().toISOString() },
    ])
    const app = crearApp(repo)
    const res = await app.inject({ method: 'GET', url: '/api/links/recientes' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    const body = res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  it.each(['1', '60', '1440'])('minutos=%s válido → 200 (R4.1)', async (minutos) => {
    const app = crearApp(crearMemoriaRepo())
    const res = await app.inject({ method: 'GET', url: `/api/links/recientes?minutos=${minutos}` })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it.each(['0', '1441', '-5', 'abc', '3.5'])(
    'minutos=%s inválido → 400 con { error, code: VALIDACION } (R4.4)',
    async (minutos) => {
      const app = crearApp(crearMemoriaRepo())
      const res = await app.inject({ method: 'GET', url: `/api/links/recientes?minutos=${minutos}` })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.code).toBe('VALIDACION')
      expect(typeof body.error).toBe('string')
    },
  )

  it('respuesta vacía → 200 sin error ni code (R3.3)', async () => {
    const app = crearApp(crearMemoriaRepo())
    const res = await app.inject({ method: 'GET', url: '/api/links/recientes' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toEqual([])
    expect(body).not.toHaveProperty('error')
    expect(body).not.toHaveProperty('code')
  })

  it('la ruta no es interceptada por la comodín GET /:slug', async () => {
    // Repo con un link cuyo slug real es "otro"; "recientes" no es un slug creado.
    const repo = await repoCon([
      { slug: 'otro', url: 'https://ej.com/otro', clicks: 0, createdAt: new Date().toISOString() },
    ])
    const app = crearApp(repo)
    const res = await app.inject({ method: 'GET', url: '/api/links/recientes' })
    // Resuelve el endpoint (200 + array), no una redirección 301 ni un 404 del comodín.
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })
})
