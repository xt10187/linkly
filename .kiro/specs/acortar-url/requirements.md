# Requirements — Acortar URL

## Introducción
`linkly` acorta URLs largas en un slug corto y redirige al visitarlo, contando los
clicks. Una sola entidad, dominio trivial a propósito: el foco es demostrar cómo una
misma configuración `.kiro/` y un mismo repo sirven a varias superficies de Kiro
(IDE, CLI y Web).

## Entidad
`Link`: `slug` (string único), `url` (destino), `clicks` (entero), `createdAt` (ISO).

## Requisitos (EARS)

### R1 — Acortar
- WHEN llega una URL válida por `POST /shorten`, THE SYSTEM SHALL generar un `slug`
  corto único, guardar el link y responder 201 con el slug y la short URL.
- IF la URL es inválida, THEN THE SYSTEM SHALL responder 400 con código `URL_INVALIDA`.
- IF el body no trae `url`, THEN THE SYSTEM SHALL responder 400 con código `VALIDACION`.

### R2 — Redirigir
- WHEN se visita `GET /:slug` y el slug existe, THE SYSTEM SHALL redirigir (301) a la
  URL original e incrementar en 1 el contador de `clicks`.
- IF el `slug` no existe, THEN THE SYSTEM SHALL responder 404 con código `NO_ENCONTRADO`.

### R3 — Listar (para HUD/demo)
- WHEN se consulta `GET /api/links`, THE SYSTEM SHALL devolver la lista de links con su
  conteo de clicks.

## Non-goals
- Sin autenticación ni cuentas de usuario.
- Sin base de datos en esta iteración (persistencia en memoria); dejar el repositorio
  detrás de una interfaz para poder cambiarlo luego.
- Sin expiración de links ni analíticas avanzadas.
