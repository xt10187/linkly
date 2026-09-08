---
inclusion: always
---

# Convenciones — linkly (acortador de URLs)

- TypeScript estricto, sin `any`. Validación con Zod en los bordes (HTTP).
- API con Fastify. Un caso de uso = una función pura testeable; los efectos
  (repositorio) se inyectan.
- La lógica de dominio (`src/domain/`) es pura: sin dependencias de Fastify ni de red.
- Formato de error consistente en la API: `{ error, code }`.
- Tests con Vitest. Todo caso de uso llega con test de camino feliz + error.
- Conventional commits.
