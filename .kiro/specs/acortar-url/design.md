# Design — Acortar URL

## Arquitectura
API HTTP con **Fastify** → capa de **dominio** (casos de uso puros) → **repositorio**
(interfaz + implementación en memoria). La lógica de dominio no conoce Fastify: recibe
el repositorio por inyección, lo que la hace testeable sin levantar el servidor.

```
HTTP (Fastify)  →  domain/acortar.ts (acortarUrl, resolverSlug)  →  LinkRepo (memoria)
```

## Componentes
- `src/domain/acortar.ts` — `acortarUrl()` y `resolverSlug()` + tipos (`Link`, `AppError`,
  códigos de error) y helpers puros (`generarSlug`, `esUrlValida`).
- `src/repos/memoriaRepo.ts` — `LinkRepo` en memoria (Map). Detrás de una interfaz para
  poder cambiarlo por SQLite/Postgres sin tocar el dominio.
- `src/app.ts` — construye la app Fastify, define las rutas y traduce `AppError` a HTTP.
- `src/server.ts` — arranca el servidor (puerto/host por env).

## Contrato de la API
- `POST /shorten` — body `{ url }` → 201 `{ slug, url, shortUrl, clicks }`.
  Errores: 400 `VALIDACION` (body inválido), 400 `URL_INVALIDA`.
- `GET /:slug` — 301 redirect a la URL; incrementa clicks. 404 `NO_ENCONTRADO`.
- `GET /api/links` — 200 con la lista de links. (Declarada antes de `/:slug` para que
  no la capture la ruta comodín.)
- Formato de error: `{ error, code }`.

## Modelo de datos
`Link { slug: string (PK), url: string, clicks: number, createdAt: string }`.

## Decisiones y trade-offs
- **Slug**: 7 caracteres base62 aleatorios; se reintenta si colisiona (colisión muy
  improbable con este espacio). Simple y suficiente para la demo.
- **Redirección 301** (permanente) para que los navegadores la cacheen.
- **Persistencia en memoria** en esta iteración; el repositorio está detrás de una
  interfaz (`LinkRepo`) para migrar a una DB sin tocar dominio ni rutas.
- **Orden de rutas**: `/api/links` se registra antes que `/:slug` para evitar que el
  comodín la capture.
