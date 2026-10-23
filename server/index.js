import { createServer } from 'node:http'
import { createDatabase } from './database.js'
import { createApiHandler } from './app.js'

const db = createDatabase()
const api = createApiHandler({ db })
const server = createServer(async (request, response) => {
  const handled = await api(request, response)
  if (handled === false) {
    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    response.end(JSON.stringify({ message: 'rota não encontrada.' }))
  }
})
const port = Number(process.env.API_PORT || 3001)
server.listen(port, '127.0.0.1', () => console.log(`Plume API pronta em http://127.0.0.1:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => { db.close(); process.exit(0) }))
}
