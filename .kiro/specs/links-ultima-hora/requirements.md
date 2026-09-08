# Requirements Document

_Links de la última hora_

## Introduction

Esta funcionalidad añade a `linkly` un endpoint de solo lectura que devuelve todos los
links (URLs acortadas) creados dentro de la última hora, entendida como una ventana
móvil de 60 minutos relativa al instante de la consulta. Reutiliza el campo `createdAt`
de la entidad `Link` existente para filtrar y sigue las convenciones del proyecto:
TypeScript estricto, validación con Zod en el borde HTTP, caso de uso puro y testeable
con el repositorio inyectado, y formato de error consistente `{ error, code }`.

El endpoint amplía el listado existente (`GET /api/links`, R3) con una variante acotada
en el tiempo, útil para paneles de "actividad reciente". La ruta se sitúa bajo el
prefijo `/api/...` para no colisionar con la ruta comodín `GET /:slug`.

## Glossary

- **SYSTEM**: La aplicación `linkly` (API Fastify) que expone los endpoints HTTP.
- **Link**: Entidad existente con los campos `slug` (string único), `url` (string de
  destino), `clicks` (entero) y `createdAt` (timestamp ISO 8601 de creación).
- **Ventana_De_Ultima_Hora**: Intervalo temporal móvil que abarca desde
  (instante_actual − 60 minutos) hasta el instante_actual, ambos límites inclusive.
- **Instante_Actual**: Momento en que el SYSTEM procesa la petición, según el reloj del
  servidor.
- **Link_Reciente**: Link cuyo `createdAt` cae dentro de la Ventana_De_Ultima_Hora.
- **LinkRepo**: Interfaz del repositorio que provee acceso a los Links persistidos.

## Requirements

_Requisitos (EARS)_

### R1 — Listar links de la última hora

**User Story:** Como operador de linkly, quiero consultar todos los links creados en la
última hora, para monitorizar la actividad reciente del acortador.

#### Acceptance Criteria

1. WHEN se consulta `GET /api/links/recientes`, THE SYSTEM SHALL devolver una respuesta
   200 con content-type `application/json` cuyo cuerpo es un array JSON que contenga
   únicamente los Link_Reciente, es decir los Link cuyo `createdAt` esté dentro de la
   Ventana_De_Ultima_Hora.
2. THE SYSTEM SHALL incluir en cada elemento del array los campos `slug` (string), `url`
   (string), `clicks` (entero ≥ 0) y `createdAt` (string ISO 8601) del Link
   correspondiente, con los mismos nombres y tipos que expone la entidad Link.
3. WHEN un Link tiene un `createdAt` anterior a (Instante_Actual − 60 minutos), THE
   SYSTEM SHALL excluir ese Link del array de la respuesta.
4. WHEN un Link tiene un `createdAt` igual al límite inferior (Instante_Actual − 60
   minutos) o igual al Instante_Actual, THE SYSTEM SHALL incluir ese Link en el array de
   la respuesta.

### R2 — Orden de los resultados

**User Story:** Como operador de linkly, quiero que los links recientes lleguen del más
nuevo al más antiguo, para ver primero la actividad más reciente.

#### Acceptance Criteria

1. WHEN la respuesta contiene dos o más Link_Reciente, THE SYSTEM SHALL ordenar el array
   por el instante de `createdAt` de forma estrictamente descendente (el más reciente
   primero).
2. WHEN dos o más Link_Reciente comparten el mismo valor de `createdAt`, THE SYSTEM SHALL
   desempatar ordenando por `slug` en orden ascendente, produciendo un resultado
   determinista (los `slug` son únicos).
3. WHEN la respuesta contiene cero o un Link_Reciente, THE SYSTEM SHALL devolver el array
   tal cual sin requerir reordenamiento.

### R3 — Resultado vacío

**User Story:** Como operador de linkly, quiero una respuesta clara cuando no hay
actividad reciente, para distinguir "sin links" de un error.

#### Acceptance Criteria

1. IF no existe ningún Link_Reciente dentro de la Ventana_De_Ultima_Hora, THEN THE
   SYSTEM SHALL responder 200 con un array JSON vacío (longitud 0).
2. WHEN el resultado es un array vacío, THE SYSTEM SHALL usar la misma estructura de
   respuesta (array JSON de links) que cuando hay resultados, sin envolverlo en otro
   objeto.
3. IF el resultado está vacío por ausencia de actividad reciente, THEN THE SYSTEM SHALL
   responder sin los campos `error` ni `code`, de modo que sea distinguible de una
   respuesta de error.

### R4 — Ventana temporal configurable

**User Story:** Como desarrollador que integra el endpoint, quiero poder ajustar el
tamaño de la ventana temporal, para reutilizar el endpoint en otros rangos sin cambiar
el código.

#### Acceptance Criteria

1. THE SYSTEM SHALL aceptar en `GET /api/links/recientes` un parámetro de consulta
   opcional `minutos`, entero en el rango 1–1440 inclusive, que define el tamaño en
   minutos de la Ventana_De_Ultima_Hora.
2. IF la petición no incluye `minutos`, THEN THE SYSTEM SHALL usar 60 minutos por defecto
   para calcular la ventana.
3. WHEN la petición incluye `minutos` como entero entre 1 y 1440, THE SYSTEM SHALL
   calcular la ventana desde (Instante_Actual − `minutos`) hasta el Instante_Actual, con
   ambos límites inclusive, y responder 200 con el array filtrado.
4. IF `minutos` no es un entero, o es menor que 1, o mayor que 1440, THEN THE SYSTEM
   SHALL responder 400 con cuerpo `{ error, code }` donde `code` es `VALIDACION`, sin
   modificar ni devolver ningún Link.

## Non-goals

- Sin autenticación ni control de acceso sobre el endpoint (coherente con el resto de la
  demo).
- Sin paginación ni límite de tamaño del array de resultados en esta iteración.
- Sin persistencia en base de datos: se sigue usando el repositorio en memoria detrás de
  la interfaz `LinkRepo`.
- Sin nuevos campos en la entidad `Link`; se reutiliza `createdAt` tal cual.
