# 🔗 linkly

Acortador de URLs minimalista. Es el **ejemplo de las superficies de Kiro** en la charla
Kiro 101: un dominio trivial a propósito, para que el foco esté en **cómo una misma
configuración `.kiro/` y un mismo repo sirven a IDE, CLI y Web**.

- `POST /shorten` `{ "url": "https://…" }` → devuelve un slug corto.
- `GET /:slug` → redirige (301) a la URL original y cuenta el click.
- `GET /api/links` → lista los links con su conteo de clicks.

**Stack:** Node + TypeScript + Fastify · validación con Zod · tests con Vitest.
Persistencia en memoria (sin DB) detrás de una interfaz `LinkRepo`.

---

## Correr

```bash
# Con Docker (un comando):
docker-compose up --build           # http://localhost:3000

# O en local:
npm install
npm run dev                          # http://localhost:3000
npm test                             # tests
```

Probar rápido:
```bash
curl -X POST localhost:3000/shorten -H 'content-type: application/json' \
  -d '{"url":"https://kiro.dev/docs"}'
# → { "slug":"Ab3xY9z", "shortUrl":"http://localhost:3000/Ab3xY9z", ... }

curl -i localhost:3000/Ab3xY9z       # 301 Location: https://kiro.dev/docs
curl localhost:3000/api/links        # lista con clicks
```

---

## Qué hay en `.kiro/` (el resultado del flujo spec-driven)

Este repo se construyó con el flujo de Kiro, y quedaron versionados **todos** los artefactos:

```
.kiro/
├── steering/convenciones.md          # reglas del proyecto (TS estricto, Zod, dominio puro)
├── specs/acortar-url/
│   ├── requirements.md               # user stories + criterios EARS (R1, R2, R3)
│   ├── design.md                     # arquitectura, contrato de API, decisiones
│   └── tasks.md                      # plan ordenado — todas las tasks en [x]
└── hooks/test-on-save.json           # corre los tests al guardar en src/
```

> El punto pedagógico: el spec es **documentación viva**. No se explica el diseño en una
> reunión que se olvida — queda en el repo, junto al código que lo implementa.

---

## 🎬 Guion de demo — las 3 superficies sobre este mismo repo

> Mensaje central: **una config `.kiro/` + un repo = tres ventanas al mismo trabajo.**
> No son 3 apps; es la misma solución vista desde IDE, CLI y Web.

### 🖥️ IDE — "crear" (el origen)
1. Abrir el repo en Kiro IDE.
2. Mostrar la carpeta **`.kiro/`**: recorrer rápido `steering/`, `specs/acortar-url/`
   (requirements → design → tasks con todo en `[x]`). *"Esto es lo que quedó del flujo
   spec-driven: no hay que adivinar por qué el código es así."*
3. Mostrar `src/domain/acortar.ts` + su test. Guardar un archivo en `src/` para que
   dispare el hook **test-on-save** y se vean los tests correr solos.

### ⌨️ CLI — "validar" (headless, mismo repo)
En una terminal, sobre el mismo repo:
```bash
kiro exec "verificá que la implementación cumple el spec acortar-url y corré los tests"
```
Punto: **la misma `.kiro/` aplica sin GUI**. Lo definido en el IDE, el CLI lo respeta —
ideal para CI/CD. (También `npm test` para mostrar el verde.)

### 🌐 Web — "delegar" (app.kiro.dev, en la nube)
1. En [app.kiro.dev](https://app.kiro.dev), conectar este repo de GitHub.
2. Delegar una tarea autónoma, por ejemplo:
   > *"Agregá un endpoint `GET /:slug/stats` que devuelva los clicks de un link, siguiendo
   > el spec `acortar-url` y las convenciones del steering. Abrí un PR."*
3. Kiro trabaja en la nube y deja un **Pull Request** en GitHub — sin ocupar tu máquina.
4. **Cierre del círculo:** volver al **IDE** (o CLI) y hacer `git pull` de la rama del PR
   para mostrar los cambios que generó la Web. *"Empecé en la Web, sigo en el IDE — mismo
   repo, misma config."*

---

## Estructura

```
linkly/
├── .kiro/                    # steering + spec + hooks (arriba)
├── src/
│   ├── domain/acortar.ts     # casos de uso puros (testeables)
│   ├── repos/memoriaRepo.ts  # LinkRepo en memoria
│   ├── app.ts                # Fastify: rutas + mapeo de errores
│   └── server.ts             # arranque
├── tests/acortar.test.ts     # Vitest (dominio)
├── Dockerfile                # multi-stage
├── docker-compose.yml
└── package.json
```
