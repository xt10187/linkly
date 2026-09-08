// Casos de uso puros del acortador. El repositorio se inyecta (testeable sin red/DB).
// Implementa R1 (acortar) y R2 (redirigir + contar clicks).

export type CodigoError = 'URL_INVALIDA' | 'NO_ENCONTRADO'

export class AppError extends Error {
  constructor(public readonly code: CodigoError, mensaje: string) {
    super(mensaje)
    this.name = 'AppError'
  }
}

export interface Link {
  slug: string
  url: string
  clicks: number
  createdAt: string
}

export interface LinkRepo {
  guardar(link: Link): Promise<void>
  buscar(slug: string): Promise<Link | null>
  incrementarClicks(slug: string): Promise<void>
  listar(): Promise<Link[]>
}

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function generarSlug(largo = 7): string {
  let s = ''
  for (let i = 0; i < largo; i++) s += BASE62[Math.floor(Math.random() * BASE62.length)]
  return s
}

export function esUrlValida(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** R1 — Acorta una URL válida y devuelve el Link creado (slug único). */
export async function acortarUrl(repo: LinkRepo, url: string): Promise<Link> {
  if (!esUrlValida(url)) {
    throw new AppError('URL_INVALIDA', 'La URL no es válida')
  }
  let slug = generarSlug()
  while (await repo.buscar(slug)) slug = generarSlug() // colisión improbable, reintenta

  const link: Link = { slug, url, clicks: 0, createdAt: new Date().toISOString() }
  await repo.guardar(link)
  return link
}

/** R2 — Resuelve un slug: devuelve la URL destino e incrementa el contador de clicks. */
export async function resolverSlug(repo: LinkRepo, slug: string): Promise<string> {
  const link = await repo.buscar(slug)
  if (!link) {
    throw new AppError('NO_ENCONTRADO', 'El slug no existe')
  }
  await repo.incrementarClicks(slug)
  return link.url
}
