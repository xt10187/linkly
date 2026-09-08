# Tasks — Acortar URL

- [x] 1. Tipos del dominio y helpers puros
  - `Link`, `AppError`, códigos (`URL_INVALIDA`, `NO_ENCONTRADO`), `generarSlug`, `esUrlValida`
  - _Requisitos: R1, R2_
- [x] 2. Repositorio en memoria detrás de la interfaz `LinkRepo`
  - `crearMemoriaRepo()` con `guardar`, `buscar`, `incrementarClicks`, `listar`
  - _Requisitos: R1, R2, R3_
- [x] 3. Caso de uso `acortarUrl()` (valida, genera slug único, guarda)
  - _Requisitos: R1_
- [x] 4. Caso de uso `resolverSlug()` (busca, incrementa clicks, devuelve URL)
  - _Requisitos: R2_
- [x] 5. App Fastify: rutas `POST /shorten`, `GET /:slug`, `GET /api/links` + mapeo de errores
  - _Requisitos: R1, R2, R3_
- [x] 6. Tests Vitest (acortar ok, URL inválida, redirigir ok, slug inexistente)
  - _Requisitos: R1, R2_
- [x] 7. Dockerfile multi-stage + docker-compose para levantar con un comando
  - _Requisitos: (infra)_

> Todas las tasks completadas. El hook `test-on-save` corre los tests al guardar
> archivos en `src/`.
