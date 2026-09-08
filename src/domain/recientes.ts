// Caso de uso puro: listar los links creados dentro de una ventana temporal móvil.
// El reloj se mantiene FUERA del dominio (se recibe `now`), de modo que la función
// es determinista y testeable sin mocks de tiempo. Implementa R1–R4.

import type { Link, LinkRepo } from './acortar.js'

export interface OpcionesRecientes {
  /** Instante de referencia (epoch ms) desde el que se mide la ventana. */
  now: number
  /** Tamaño de la ventana en minutos. Por defecto 60. Se asume ya validado (1–1440). */
  minutos?: number
}

export const MINUTOS_POR_DEFECTO = 60

/**
 * R1–R4 — Devuelve los links cuyo createdAt cae dentro de la ventana
 * [now - minutos·60000, now] (ambos límites inclusive), ordenados por createdAt
 * descendente y, ante empate, por slug ascendente. Función pura y determinista:
 * no lee el reloj (se le pasa `now`) y no muta el array del repositorio.
 */
export async function listarRecientes(
  repo: LinkRepo,
  opts: OpcionesRecientes,
): Promise<Link[]> {
  const minutos = opts.minutos ?? MINUTOS_POR_DEFECTO
  const desde = opts.now - minutos * 60_000

  const todos = await repo.listar()

  // Filtra por ventana [desde, now] inclusive según el instante de createdAt.
  const dentro = todos.filter((link) => {
    const t = Date.parse(link.createdAt)
    return desde <= t && t <= opts.now
  })

  // Ordena sobre la copia (no muta el array del repo): createdAt desc, slug asc.
  dentro.sort((a, b) => {
    const ta = Date.parse(a.createdAt)
    const tb = Date.parse(b.createdAt)
    if (tb !== ta) return tb - ta // más reciente primero (descendente)
    // Empate de createdAt: desempata por slug ascendente (lexicográfico).
    if (a.slug < b.slug) return -1
    if (a.slug > b.slug) return 1
    return 0
  })

  return dentro
}
