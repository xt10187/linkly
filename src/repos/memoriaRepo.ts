import type { Link, LinkRepo } from '../domain/acortar.js'

// Persistencia en memoria: suficiente para la demo (sin DB).
// Para producción se cambiaría por una implementación con SQLite/Postgres.
export function crearMemoriaRepo(): LinkRepo {
  const db = new Map<string, Link>()
  return {
    async guardar(link) {
      db.set(link.slug, { ...link })
    },
    async buscar(slug) {
      return db.get(slug) ?? null
    },
    async incrementarClicks(slug) {
      const l = db.get(slug)
      if (l) l.clicks++
    },
    async listar() {
      return [...db.values()]
    },
  }
}
