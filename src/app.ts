import Fastify, { type FastifyInstance } from 'fastify'
import { z } from 'zod'
import { acortarUrl, resolverSlug, AppError, type LinkRepo } from './domain/acortar.js'
import { listarRecientes } from './domain/recientes.js'
import { crearMemoriaRepo } from './repos/memoriaRepo.js'

const shortenSchema = z.object({
  url: z.string().min(1),
})

// R4 — `minutos` opcional; se coacciona a entero y se acota al rango permitido (1–1440).
const recientesQuerySchema = z.object({
  minutos: z.coerce.number().int().min(1).max(1440).optional(),
})

// Formato de error consistente: { error, code }
function enviarError(reply: any, status: number, code: string, error: string) {
  return reply.code(status).send({ error, code })
}

export function crearApp(repo: LinkRepo = crearMemoriaRepo()): FastifyInstance {
  const app = Fastify({ logger: false })

  // Home mínima para la demo
  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>linkly</title>
<style>body{font-family:system-ui;max-width:640px;margin:3rem auto;padding:0 1rem;color:#13191c}
code{background:#eef;padding:.15rem .4rem;border-radius:4px}</style></head>
<body>
<h1>🔗 linkly</h1>
<p>Acortador de URLs minimalista — ejemplo de las superficies de Kiro.</p>
<h3>API</h3>
<ul>
<li><code>POST /shorten</code> <br> body: <code>{ "url": "https://ejemplo.com/una/pagina/larga" }</code> → devuelve el slug</li>
<li><code>GET /:slug</code> → redirige (301) a la URL original y cuenta el click</li>
<li><code>GET /api/links</code> → lista los links con su conteo de clicks</li>
<li><code>GET /api/links/recientes?minutos=</code> → links creados en la última hora (ventana móvil, por defecto 60 min, <code>minutos</code> opcional 1–1440)</li>
</ul>
</body></html>`)
  })

  // R1 — Acortar
  app.post('/shorten', async (req, reply) => {
    const parsed = shortenSchema.safeParse(req.body)
    if (!parsed.success) {
      return enviarError(reply, 400, 'VALIDACION', 'Body inválido: se espera { url }')
    }
    try {
      const link = await acortarUrl(repo, parsed.data.url)
      const base = `${req.protocol}://${req.headers.host}`
      return reply.code(201).send({
        slug: link.slug,
        url: link.url,
        shortUrl: `${base}/${link.slug}`,
        clicks: link.clicks,
      })
    } catch (e) {
      if (e instanceof AppError) return enviarError(reply, 400, e.code, e.message)
      throw e
    }
  })

  // Listado (para el HUD / demo). Antes de la ruta comodín /:slug.
  app.get('/api/links', async (_req, reply) => {
    const links = await repo.listar()
    return reply.send(links)
  })

  // R1–R4 — Links de la última hora (ventana móvil configurable con `minutos`).
  // Registrada ANTES de la comodín /:slug para que no la capture.
  app.get('/api/links/recientes', async (req, reply) => {
    const parsed = recientesQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return enviarError(reply, 400, 'VALIDACION', 'Parámetro minutos inválido (entero 1–1440)')
    }
    const links = await listarRecientes(repo, {
      now: Date.now(),
      minutos: parsed.data.minutos, // undefined → el dominio usa 60 por defecto
    })
    return reply.send(links)
  })

  // R2 — Redirigir
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    try {
      const url = await resolverSlug(repo, slug)
      return reply.code(301).redirect(url)
    } catch (e) {
      if (e instanceof AppError) return enviarError(reply, 404, e.code, e.message)
      throw e
    }
  })

  return app
}
