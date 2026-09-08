import { describe, it, expect } from 'vitest'
import { acortarUrl, resolverSlug, AppError } from '../src/domain/acortar.js'
import { crearMemoriaRepo } from '../src/repos/memoriaRepo.js'

describe('acortarUrl (R1)', () => {
  it('acorta una URL válida y devuelve un slug de 7 chars', async () => {
    const repo = crearMemoriaRepo()
    const link = await acortarUrl(repo, 'https://ejemplo.com/una/pagina/larga')
    expect(link.slug).toHaveLength(7)
    expect(link.clicks).toBe(0)
    expect(await repo.buscar(link.slug)).not.toBeNull()
  })

  it('rechaza una URL inválida con URL_INVALIDA', async () => {
    const repo = crearMemoriaRepo()
    await expect(acortarUrl(repo, 'no-es-una-url')).rejects.toMatchObject({ code: 'URL_INVALIDA' })
  })
})

describe('resolverSlug (R2)', () => {
  it('devuelve la URL destino e incrementa clicks', async () => {
    const repo = crearMemoriaRepo()
    const link = await acortarUrl(repo, 'https://ejemplo.com')
    const url = await resolverSlug(repo, link.slug)
    expect(url).toBe('https://ejemplo.com')
    expect((await repo.buscar(link.slug))!.clicks).toBe(1)
  })

  it('falla con NO_ENCONTRADO si el slug no existe', async () => {
    const repo = crearMemoriaRepo()
    await expect(resolverSlug(repo, 'zzzzzzz')).rejects.toMatchObject({ code: 'NO_ENCONTRADO' })
  })
})
