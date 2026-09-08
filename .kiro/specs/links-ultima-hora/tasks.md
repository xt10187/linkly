# Tasks — Links de la última hora

## Overview

Plan de implementación para el endpoint de solo lectura `GET /api/links/recientes`.
Se construye una función de dominio pura (`src/domain/recientes.ts`) que filtra y ordena
los links dentro de una ventana temporal móvil, y se cablea la ruta HTTP en `src/app.ts`
**antes** de la ruta comodín `GET /:slug`, reutilizando el helper `enviarError` y Zod
para validar el query param `minutos`. Se sigue la convención dual del proyecto: property
tests (fast-check) + unit tests + route tests (Vitest, `crearApp` + `app.inject`).

Cada task es incremental: primero las dependencias de test, luego el dominio puro (con
sus tests), después el cableado de la ruta (con sus tests de contrato), y por último la
documentación opcional.

## Tasks

- [x] 1. Preparar dependencia de property-based testing
  - Añadir `fast-check` a `devDependencies` en `package.json` (p. ej. `^3.x`) y ejecutar
    la instalación (`npm install`) para actualizar `package-lock.json`.
  - fast-check es la librería usada por los property tests del dominio (no reimplementar
    PBT a mano); integra con Vitest.
  - _Requisitos: 2.1, 2.2, 4.3 (habilita los property tests que los validan)_

- [x] 2. Implementar el dominio puro `listarRecientes`
  - [x] 2.1 Crear `src/domain/recientes.ts` con tipos y la función pura
    - Importar `type { Link, LinkRepo } from './acortar.js'`.
    - Exportar `interface OpcionesRecientes { now: number; minutos?: number }` y la
      constante `export const MINUTOS_POR_DEFECTO = 60`.
    - Implementar `export async function listarRecientes(repo: LinkRepo, opts: OpcionesRecientes): Promise<Link[]>`:
      - `minutos = opts.minutos ?? MINUTOS_POR_DEFECTO`.
      - `desde = opts.now - minutos * 60_000`; incluir un link si
        `desde <= Date.parse(link.createdAt) <= opts.now` (ambos límites inclusive).
      - Obtener los links con `await repo.listar()`; ordenar **sobre una copia** (no mutar
        el array del repo) por instante de `createdAt` descendente y, ante empate, por
        `slug` ascendente (lexicográfico).
      - No lanza `AppError`: para entradas ya validadas siempre devuelve un array
        (posiblemente vacío).
    - _Requisitos: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 4.2, 4.3_

  - [x]* 2.2 Property test — correspondencia exacta con la ventana
    - **Feature: links-ultima-hora, Property 1: Correspondencia exacta con la ventana**
    - Con fast-check (`{ numRuns: 100 }` mínimo): generar listas de `Link` con `slug`
      únicos, `url` arbitrarias, `clicks >= 0` y `createdAt` ISO alrededor de `now`
      (dentro, fuera y justo en los bordes `now` y `now - minutos·60000`); `now`
      arbitrario y `minutos` entero 1–1440.
    - Verificar que el conjunto devuelto es exactamente el de links cuyo `createdAt` cae
      en `[now - minutos·60000, now]` (pertenencia + completitud + inclusividad de bordes).
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 4.3**

  - [x]* 2.3 Property test — orden total determinista (createdAt desc, slug asc)
    - **Feature: links-ultima-hora, Property 2: Orden total determinista (createdAt desc, slug asc)**
    - Con fast-check (`{ numRuns: 100 }`): para todo par adyacente del resultado, el
      `createdAt` del anterior es >= al del siguiente y, si son iguales, el `slug` del
      anterior es estrictamente < que el del siguiente.
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x]* 2.4 Property test — subconjunto/permutación e inmutabilidad del repo
    - **Feature: links-ultima-hora, Property 3: El resultado es una permutación de un subconjunto del repositorio**
    - Con fast-check (`{ numRuns: 100 }`): cada elemento devuelto es idéntico (mismos
      `slug`, `url`, `clicks`, `createdAt`) a un link del repo; no hay `slug` duplicados;
      el contenido del repo no se modifica tras invocar `listarRecientes`.
    - **Validates: Requirements 1.2**

  - [x]* 2.5 Property test — ventana por defecto de 60 minutos
    - **Feature: links-ultima-hora, Property 4: Ventana por defecto de 60 minutos**
    - Con fast-check (`{ numRuns: 100 }`): invocar sin `minutos` produce el mismo
      resultado que invocar con `minutos = 60`.
    - **Validates: Requirements 4.2**

  - [x]* 2.6 Property test — monotonicidad respecto al tamaño de la ventana
    - **Feature: links-ultima-hora, Property 5: Monotonicidad respecto al tamaño de la ventana**
    - Con fast-check (`{ numRuns: 100 }`): para `m1 <= m2` (ambos 1–1440), el conjunto de
      links con `minutos = m1` es subconjunto del obtenido con `minutos = m2`.
    - **Validates: Requirements 4.3**

  - [x]* 2.7 Unit tests del dominio — ejemplos y casos borde
    - Resultado vacío: repo vacío y repo con todos los links fuera de ventana → `[]`.
    - 0 y 1 elemento: se devuelve sin error y con la longitud esperada.
    - Bordes exactos: un link con `createdAt == now` y otro con
      `createdAt == now - minutos·60000` se incluyen.
    - Empate de `createdAt`: varios links con el mismo `createdAt` salen ordenados por
      `slug` ascendente.
    - _Requisitos: 1.4, 2.2, 2.3, 3.1_

- [x] 3. Checkpoint — dominio verde
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Cablear la ruta `GET /api/links/recientes` en `src/app.ts`
  - Importar `listarRecientes` desde `./domain/recientes.js`.
  - Definir el esquema Zod:
    `const recientesQuerySchema = z.object({ minutos: z.coerce.number().int().min(1).max(1440).optional() })`.
  - Registrar `app.get('/api/links/recientes', ...)` **antes** de la ruta comodín
    `GET /:slug` (junto al bloque `/api/...`, tras `GET /api/links`):
    - `safeParse(req.query)`; si falla →
      `enviarError(reply, 400, 'VALIDACION', 'Parámetro minutos inválido (entero 1–1440)')`
      sin consultar el repo ni devolver ningún link.
    - Si es válido → `listarRecientes(repo, { now: Date.now(), minutos: parsed.data.minutos })`
      (`undefined` → el dominio usa 60 por defecto) y `reply.send(links)` (array JSON, sin
      envoltura; `200` por defecto).
  - _Requisitos: 1.1, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4_

  - [x]* 4.1 Route tests — validación y contrato HTTP
    - Usar `crearApp(repo)` con un repo en memoria e `app.inject`.
    - `GET /api/links/recientes` sin `minutos` → `200`, body es un **array** JSON.
    - `?minutos=1` / `=60` / `=1440` → `200` (valores válidos).
    - `?minutos=0` / `=1441` / `=-5` / `=abc` / `=3.5` → `400` con body
      `{ error, code: 'VALIDACION' }`.
    - Respuesta vacía: `200` cuyo body **no** contiene `error` ni `code`.
    - Orden de rutas: `GET /api/links/recientes` resuelve al endpoint nuevo y no es
      interceptada por la comodín `GET /:slug`.
    - _Requisitos: 1.1, 3.2, 3.3, 4.1, 4.2, 4.4_

- [x] 5. Checkpoint — endpoint completo y verde
  - Ensure all tests pass, ask the user if questions arise.

- [x]* 6. Actualizar el listado de la API en la home HTML de `src/app.ts`
  - Añadir en la `<ul>` de la home una entrada para
    `GET /api/links/recientes?minutos=` describiendo la ventana móvil (por defecto 60 min).
  - Task opcional: documentación de conveniencia; no mapea a un requisito funcional.
  - _Requisitos: (documentación, sin requisito asociado)_

## Notes

- Las tasks marcadas con `*` son opcionales (tests y documentación) y pueden omitirse para
  un MVP más rápido; las de implementación central nunca se marcan opcionales.
- El dominio se mantiene puro: recibe `now` como parámetro y no lee el reloj (determinista
  y testeable sin mocks de tiempo).
- Los property tests usan **fast-check** con **mínimo 100 iteraciones** (`{ numRuns: 100 }`)
  y cada uno se etiqueta con el comentario `Feature: links-ultima-hora, Property {n}: {texto}`.
- El orden de registro de la ruta es crítico: `GET /api/links/recientes` debe declararse
  antes de la comodín `GET /:slug`.
- Cada task referencia los requisitos/propiedades que implementa para trazabilidad.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "4"] },
    { "id": 3, "tasks": ["4.1", "6"] }
  ]
}
```
