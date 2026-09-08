import { crearApp } from './app.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'

const app = crearApp()

app
  .listen({ port, host })
  .then(() => console.log(`linkly escuchando en http://${host}:${port}`))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
