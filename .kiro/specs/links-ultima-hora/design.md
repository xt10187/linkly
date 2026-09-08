# Design — Links de la última hora

## Overview

Se añade un endpoint de solo lectura `GET /api/links/recientes` que devuelve los links
creados dentro de una ventana temporal móvil (por defecto 60 minutos, configurable con
el query param opcional `minutos`, entero 1–1440). Reutiliza el campo `createdAt` de la
entidad `Link` para filtrar y ordenar, y respeta las convenciones del proyecto: dominio
puro y testeable, validación con Zod en el borde HTTP y formato de error `{ error, code }`.

La pieza central es una **función de dominio pura** que recibe los links, el instante de
referencia (`now`) y el tamaño de ventana en minutos, y devuelve el subconjunto dentro
de la ventana ordenado. La ruta HTTP se limita a validar la entrada, calcular `now` y
serializar. Mantener el reloj **fuera** del dominio hace la función determinista y
testeable sin mocks de tiempo.

## Architecture

API HTTP con **Fastify** → capa de **dominio** (caso de uso puro) → **repositorio**
(interfaz `LinkRepo`, implementación en memoria). El dominio no conoce Fastify ni el
reloj: recibe el repositorio inyectado y el instante `now` como parámetro.

```
HTTP (Fastify)                         domain/recientes.ts               LinkRepo (memoria)
GET /api/links/recientes  ──valida──►  listarRecientes(repo, opts)  ──►  repo.listar()
  · Zod: minutos? (1–1440)             · filtra por ventana [now-min, now]
  · now = Date.now()                   · ordena createdAt desc, slug asc
  · 400 VALIDACION si inválido         · (puro: no lee el reloj)
```

Separación de responsabilidades:

- **Ruta (borde):** parsea/valida `minutos` con Zod, calcula `now` con el reloj del
  servidor, invoca el dominio y responde el array JSON. Traduce fallos de validación a
  `400 { error, code: 'VALIDACION' }`.
- **Dominio (puro):** filtra y ordena de forma determinista dado `(links, now, minutos)`.
  No lanza `AppError`: para entradas ya validadas siempre produce un array (posiblemente
  vacío).
- **Repositorio:** ya provee `listar()`, que basta para obtener todos los links. No se
  requieren métodos nuevos.

## Components and Interfaces

- `src/domain/recientes.ts` — **nuevo**. Función de dominio pura y sus tipos de opciones.

  ```ts
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
   * [now - minutos, now] (ambos límites inclusive), ordenados por createdAt
   * descendente y, ante empate, por slug ascendente. Función pura y determinista:
   * no lee el reloj (se le pasa `now`).
   */
  export async function listarRecientes(
    repo: LinkRepo,
    opts: OpcionesRecientes,
  ): Promise<Link[]> { /* ... */ }
  ```

  Notas de implementación:
  - `minutos = opts.minutos ?? MINUTOS_POR_DEFECTO`.
  - `desde = opts.now - minutos * 60_000`; un link entra si
    `desde <= Date.parse(link.createdAt) <= opts.now`.
  - Orden: comparar por instante de `createdAt` descendente; si son iguales, por `slug`
    ascendente (`localeCompare` o comparación lexicográfica estable). Se ordena sobre una
    copia (no muta el array del repo).

- `src/app.ts` — **modificado**. Se registra la nueva ruta `GET /api/links/recientes`
  **antes** de la ruta comodín `GET /:slug` (y junto al resto de rutas `/api/...`) para
  que el comodín no la capture. Reutiliza el helper existente `enviarError`.

- `src/domain/acortar.ts`, `src/repos/memoriaRepo.ts` — **sin cambios**. Se reutilizan
  el tipo `Link`, la interfaz `LinkRepo` y `listar()`.

### Wiring de la ruta

```ts
const recientesQuerySchema = z.object({
  // opcional; se coacciona a número entero y se acota al rango permitido
  minutos: z.coerce.number().int().min(1).max(1440).optional(),
})

// Registrada ANTES de la comodín GET /:slug (junto a GET /api/links)
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
```

> **Orden de registro (crítico):** `GET /api/links/recientes` debe declararse antes que
> `GET /:slug`. Aunque Fastify prioriza rutas estáticas sobre paramétricas, se registra
> explícitamente en el bloque `/api/...` (antes de la comodín) para mantener el patrón ya
> usado por `GET /api/links` y evitar ambigüedad. `recientes` tampoco colisiona con
> `/api/links` por ser una ruta hija bajo `/api/links/...`.

## Data Models

Sin cambios en la entidad. Se reutiliza tal cual:

```ts
Link { slug: string (PK), url: string, clicks: number, createdAt: string /* ISO 8601 */ }
```

- El filtro y el orden se basan en el instante derivado de `createdAt`
  (`Date.parse(createdAt)`), que ya se escribe en `acortarUrl` con
  `new Date().toISOString()`.
- La respuesta expone los objetos `Link` completos (mismos nombres y tipos), sin
  proyección ni envoltura.
- **Repositorio:** `LinkRepo.listar()` es suficiente. No se añaden métodos. (Opción
  futura, fuera de alcance: si el volumen crece, podría añadirse un
  `listarDesde(instante)` al repo para filtrar en la capa de datos; hoy no aporta valor
  con el repo en memoria.)

## Correctness Properties

_A property is a characteristic or behavior that should hold true across all valid
executions of a system — essentially, a formal statement about what the system should do.
Properties serve as the bridge between human-readable specifications and machine-verifiable
correctness guarantees._

El caso de uso `listarRecientes` es una función pura de filtrado y ordenación sobre un
espacio de entrada amplio (listas arbitrarias de links, cualquier `now`, cualquier
`minutos` válido), por lo que es un buen candidato para property-based testing. Las
propiedades siguientes surgen de la prework, ya consolidada para eliminar redundancias
(la pertenencia a la ventana, la exclusión de lo que queda fuera y la inclusividad de los
bordes se unifican en la propiedad de *correspondencia exacta*).

### Property 1: Correspondencia exacta con la ventana

*For any* lista de links, instante `now` y `minutos` válido (1–1440), el conjunto de
links devuelto por `listarRecientes` es exactamente el conjunto de links del repositorio
cuyo `createdAt` cae en el intervalo cerrado `[now - minutos·60000, now]`: todo link
devuelto está dentro de la ventana (pertenencia), ningún link dentro de la ventana se
omite (completitud) y los bordes exactos se incluyen (inclusividad).

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 4.3**

### Property 2: Orden total determinista (createdAt desc, slug asc)

*For any* lista de links, `now` y `minutos` válido, en el array resultante todo par de
elementos adyacentes cumple que el `createdAt` del anterior es mayor o igual que el del
siguiente y, cuando ambos `createdAt` son iguales, el `slug` del anterior es
estrictamente menor que el del siguiente (orden lexicográfico ascendente).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: El resultado es una permutación de un subconjunto del repositorio

*For any* lista de links, `now` y `minutos` válido, cada elemento devuelto es idéntico
(mismos `slug`, `url`, `clicks`, `createdAt`) a un link presente en el repositorio, no hay
`slug` duplicados en el resultado y `listarRecientes` no modifica el contenido del
repositorio.

**Validates: Requirements 1.2**

### Property 4: Ventana por defecto de 60 minutos

*For any* lista de links y `now`, invocar `listarRecientes` sin `minutos` produce el mismo
resultado que invocarlo con `minutos = 60`.

**Validates: Requirements 4.2**

### Property 5: Monotonicidad respecto al tamaño de la ventana

*For any* lista de links, `now` y par de ventanas válidas `m1 <= m2` (ambas en 1–1440),
el conjunto de links devuelto con `minutos = m1` es un subconjunto del devuelto con
`minutos = m2` (una ventana más grande nunca excluye lo que incluye una más pequeña).

**Validates: Requirements 4.3**

## Error Handling

| Situación | Capa | Respuesta |
| --- | --- | --- |
| `minutos` no entero, `< 1`, `> 1440`, o no numérico | Ruta (Zod) | `400 { error, code: 'VALIDACION' }` vía `enviarError`; no se consulta el repo ni se devuelve ningún link |
| `minutos` ausente | Ruta | Válido; el dominio aplica 60 por defecto → `200` |
| Sin links recientes / repo vacío | Dominio | `200` con array vacío `[]` (sin `error` ni `code`) |
| Entrada válida | Dominio | `200` con array de links filtrado y ordenado |

- Se reutiliza el helper existente `enviarError(reply, status, code, error)` que produce
  `{ error, code }`, alineado con `POST /shorten` y `GET /:slug`.
- El dominio **no** lanza `AppError` para este caso de uso: al recibir entradas ya
  validadas, siempre devuelve un array. Esto mantiene la distinción clara entre
  "sin resultados" (`200` + `[]`) y "error" (`4xx` + `{ error, code }`), tal como exige R3.
- La ausencia de resultados nunca produce `error`/`code`, de modo que el consumidor puede
  distinguir "sin actividad reciente" de un fallo (R3.3).

## Testing Strategy

Enfoque dual (convención del proyecto: Vitest, camino feliz + error):

- **Property tests (dominio):** validan las propiedades universales de `listarRecientes`
  sobre entradas generadas aleatoriamente.
- **Unit tests (dominio):** ejemplos concretos y casos borde específicos.
- **Route tests (borde HTTP):** validación de `minutos` y forma de la respuesta.

### Property-based testing

- Librería: **fast-check** (integra con Vitest; no reimplementar PBT a mano).
- Configuración: mínimo **100 iteraciones** por propiedad (`{ numRuns: 100 }`).
- Generadores: listas de `Link` con `slug` únicos, `url` arbitrarias, `clicks >= 0` y
  `createdAt` = ISO de instantes alrededor de `now` (incluyendo instantes justo en los
  bordes `now` y `now - minutos·60000`, dentro y fuera de la ventana); `now` arbitrario y
  `minutos` entero en 1–1440.
- Cada test se etiqueta con un comentario que referencia la propiedad de diseño, con el
  formato: **Feature: links-ultima-hora, Property {número}: {texto}**.
- Mapa test → propiedad:
  - Property 1 → un test de correspondencia exacta con la ventana (pertenencia +
    completitud + bordes).
  - Property 2 → un test de orden total (createdAt desc, slug asc en pares adyacentes).
  - Property 3 → un test de subconjunto/permutación e inmutabilidad del repo.
  - Property 4 → un test de equivalencia default == 60.
  - Property 5 → un test metamórfico de monotonicidad de ventana (`m1 <= m2` ⇒ subconjunto).

### Unit tests (ejemplos y edge cases)

- **Resultado vacío:** repo vacío y repo con todos los links fuera de ventana → `[]`
  (R3.1).
- **0 y 1 elemento:** se devuelve sin error y con la longitud esperada (R2.3).
- **Bordes exactos:** un link con `createdAt == now` y otro con `createdAt == now -
  minutos·60000` se incluyen (R1.4).
- **Empate de `createdAt`:** varios links con el mismo `createdAt` salen ordenados por
  `slug` ascendente (R2.2).

### Route tests (validación y contrato HTTP)

Usando `crearApp(repo)` con un repo en memoria e `app.inject`:

- `GET /api/links/recientes` sin `minutos` → `200`, body es un **array** JSON (R3.2, R4.2).
- `GET /api/links/recientes?minutos=1` / `=60` / `=1440` → `200` (valores válidos, R4.1).
- `GET /api/links/recientes?minutos=0` / `=1441` / `=-5` / `=abc` / `=3.5` → `400` con
  body `{ error, code: 'VALIDACION' }` (R4.4).
- Respuesta vacía: `200` cuyo body **no** contiene `error` ni `code` (R3.3).
- Orden de rutas: un `slug` real (p. ej. `recientes` no es un slug válido creado) no
  intercepta la ruta; `GET /api/links/recientes` resuelve al endpoint y no a `GET /:slug`.
