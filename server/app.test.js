import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from './database.js'
import { createApiHandler } from './app.js'

const reportUrl = 'https://app.powerbi.com/view?r=eyJrIjoiYzBjZTIzNDQtNjcxNi00NmEwLTg1NzQtMDQ3YWE3M2ZkZDEwIiwidCI6ImIxMDUxYzRiLTNiOTQtNDFhYi05NDQxLWU3M2E3MjM0MmZkZCJ9'
const legacyReportUrl = 'https://app.powerbi.com/reportEmbed?reportId=22450b7a-e0c7-4472-a33a-becc7adaa99e&autoAuth=true&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd'
const testDirectory = mkdtempSync(join(tmpdir(), 'plume-api-test-'))
const databasePath = join(testDirectory, 'integration.sqlite')
const database = createDatabase(databasePath)
const api = createApiHandler({ db: database, secureCookies: false, defaultPowerBiUrl: reportUrl })
const server = createServer(async (request, response) => {
  const handled = await api(request, response)
  if (handled === false) { response.writeHead(404); response.end() }
})
let baseUrl
let ownerA
let ownerB
let indicatorId

function cookiesFrom(response) {
  return response.headers.getSetCookie().map((entry) => entry.split(';', 1)[0]).join('; ')
}

async function request(path, { method = 'GET', cookie = '', csrf = '', body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function register(email, organizationName) {
  const response = await request('/api/auth/register', {
    method: 'POST', body: { nome: 'Responsável', email, organizationName, senha: 'senha-de-teste-12' },
  })
  assert.equal(response.status, 201)
  const cookie = cookiesFrom(response)
  const session = await request('/api/auth/session', { cookie })
  const data = await session.json()
  assert.ok(data.csrfToken)
  return { cookie, csrf: data.csrfToken, user: data.user }
}

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  ownerA = await register('owner-a@example.test', 'Usina A')
  ownerB = await register('owner-b@example.test', 'Usina B')
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  database.close()
  try {
    const reopened = createDatabase(databasePath)
    const persisted = reopened.prepare("SELECT payload FROM records WHERE organization_id = ? AND kind = 'unidade' ORDER BY id LIMIT 1").get(ownerA.user.organizationId)
    assert.ok(persisted)
    assert.ok(JSON.parse(persisted.payload).nome)
    reopened.close()
  } finally {
    try { rmSync(databasePath, { force: true }) } catch { /* SQLite/native scanners can briefly hold Windows file handles. */ }
    try { rmSync(testDirectory, { recursive: true, force: true }) } catch { /* The OS temp cleaner will remove a locked test artifact. */ }
  }
})

test('a sessão é criada no servidor e dados ausentes ficam anônimos', async () => {
  const anonymous = await request('/api/auth/session')
  assert.deepEqual(await anonymous.json(), { user: null })
  const session = await request('/api/auth/session', { cookie: ownerA.cookie })
  assert.equal((await session.json()).user.organizationId, ownerA.user.organizationId)
  const dashboard = await request('/api/indicador', { cookie: ownerA.cookie })
  assert.ok((await dashboard.json()).some((item) => item.Url === reportUrl))
})

test('migra o dashboard padrão antigo para o link público configurado', () => {
  const createdAt = new Date().toISOString()
  const result = database.prepare('INSERT INTO records (organization_id, kind, payload, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    ownerA.user.organizationId,
    'indicador',
    JSON.stringify({ Nome: 'Dashboard', Descricao: 'Padrão antigo', Url: 'https://app.powerbi.com/reportEmbed?reportId=022d42c1-d543-4a0d-9bd8-f3ac742a7ff1&autoAuth=true&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd' }),
    ownerA.user.id,
    createdAt,
    createdAt,
  )
  createApiHandler({ db: database, secureCookies: false, defaultPowerBiUrl: reportUrl })
  const row = database.prepare('SELECT payload FROM records WHERE id = ?').get(result.lastInsertRowid)
  assert.equal(JSON.parse(row.payload).Url, reportUrl)
})

test('login valida senha sem revelar a credencial esperada', async () => {
  const invalid = await request('/api/auth/login', { method: 'POST', body: { email: 'owner-a@example.test', senha: 'errada' } })
  assert.equal(invalid.status, 401)
  assert.match((await invalid.json()).message, /e-mail ou senha inválidos/i)
  const valid = await request('/api/auth/login', { method: 'POST', body: { email: 'owner-a@example.test', senha: 'senha-de-teste-12' } })
  assert.equal(valid.status, 200)
  assert.ok(cookiesFrom(valid).includes('plume_session='))
})

test('sessão expirada não autoriza rotas protegidas', async () => {
  const token = ownerB.cookie.split('; ').find((cookie) => cookie.startsWith('plume_session=')).split('=', 2)[1]
  const tokenHash = (await import('node:crypto')).createHash('sha256').update(decodeURIComponent(token)).digest('hex')
  database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() - 1, tokenHash)
  const expired = await request('/api/auth/session', { cookie: ownerB.cookie })
  assert.deepEqual(await expired.json(), { user: null })
  assert.equal((await request('/api/indicador', { cookie: ownerB.cookie })).status, 401)
  const login = await request('/api/auth/login', { method: 'POST', body: { email: 'owner-b@example.test', senha: 'senha-de-teste-12' } })
  const cookie = cookiesFrom(login)
  const session = await request('/api/auth/session', { cookie })
  ownerB = { cookie, csrf: (await session.json()).csrfToken, user: ownerB.user }
})

test('CSRF é obrigatório em escritas e o indicador persiste em uma nova consulta', async () => {
  const semCsrf = await request('/api/indicador', { method: 'POST', cookie: ownerA.cookie, body: { Nome: 'Dashboard', Descricao: 'Relatório agrícola', Url: reportUrl } })
  assert.equal(semCsrf.status, 403)
  const salvo = await request('/api/indicador', { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { Nome: 'Dashboard', Descricao: 'Relatório agrícola', Url: reportUrl } })
  assert.equal(salvo.status, 201)
  indicatorId = (await salvo.json()).Id
  const favorite = await request('/api/auth/profile', { method: 'PATCH', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { favoritos: [indicatorId] } })
  assert.deepEqual((await favorite.json()).user.favoritos, [indicatorId])
  const consultaNova = await request('/api/indicador', { cookie: ownerA.cookie })
  const registros = await consultaNova.json()
  assert.ok(registros.some((item) => item.Id === indicatorId && item.Url === new URL(reportUrl).toString()))
})

test('a organização restringe listagem, consulta e escrita por ID', async () => {
  const lista = await request('/api/indicador', { cookie: ownerB.cookie })
  const registrosB = await lista.json()
  assert.equal(registrosB.some((item) => item.Id === indicatorId), false)
  const consulta = await request(`/api/indicador/${indicatorId}`, { cookie: ownerB.cookie })
  assert.equal(consulta.status, 404)
  const escrita = await request(`/api/indicador/${indicatorId}`, {
    method: 'PUT', cookie: ownerB.cookie, csrf: ownerB.csrf,
    body: { Nome: 'Alterado', Descricao: 'Não autorizado', Url: reportUrl },
  })
  assert.equal(escrita.status, 404)
  const favoritoCruzado = await request('/api/auth/profile', {
    method: 'PATCH', cookie: ownerB.cookie, csrf: ownerB.csrf, body: { favoritos: [indicatorId] },
  })
  assert.equal(favoritoCruzado.status, 400)
  const deleted = await request(`/api/indicador/${indicatorId}`, { method: 'DELETE', cookie: ownerA.cookie, csrf: ownerA.csrf })
  assert.equal(deleted.status, 204)
  const profile = await request('/api/auth/session', { cookie: ownerA.cookie })
  assert.deepEqual((await profile.json()).user.favoritos, [])
})

test('aceita link público Power BI e formato reportEmbed legado; rejeita hosts externos', async () => {
  const publico = await request('/api/indicador', {
    method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf,
    body: { Nome: 'Dashboard público', Descricao: 'URL pública', Url: reportUrl },
  })
  assert.equal(publico.status, 201)
  const legado = await request('/api/indicador', {
    method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf,
    body: { Nome: 'Dashboard legado', Descricao: 'URL reportEmbed', Url: legacyReportUrl },
  })
  assert.equal(legado.status, 201)
  const externo = await request('/api/indicador', {
    method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf,
    body: { Nome: 'Inseguro', Descricao: 'Host externo', Url: reportUrl.replace('app.powerbi.com', 'evil.example') },
  })
  assert.equal(externo.status, 400)
  const unidade = await request('/api/cadastros/unidade', { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'Unidade A' } })
  const unidadeId = (await unidade.json()).Id
  const equipamentoCruzaTenant = await request('/api/cadastros/equipamento', {
    method: 'POST', cookie: ownerB.cookie, csrf: ownerB.csrf,
    body: { nome: 'Sensor', unidade: unidadeId },
  })
  assert.equal(equipamentoCruzaTenant.status, 400)
})

test('bloqueia exclusão de registros referenciados por outros dados', async () => {
  const unitResponse = await request('/api/cadastros/unidade', { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'Unidade vinculada' } })
  const unit = await unitResponse.json()
  const equipment = await request('/api/cadastros/equipamento', { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'Sensor', unidade: unit.Id } })
  assert.equal(equipment.status, 201)
  const deleted = await request(`/api/cadastros/unidade/${unit.Id}`, { method: 'DELETE', cookie: ownerA.cookie, csrf: ownerA.csrf })
  assert.equal(deleted.status, 409)
})

test('o CRUD de cadastro lê, atualiza e exclui registros persistidos', async () => {
  const created = await request('/api/cadastros/unidademedida', {
    method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'graus Celsius', simbolo: '°C' },
  })
  assert.equal(created.status, 201)
  const item = await created.json()
  const read = await request(`/api/cadastros/unidademedida/${item.Id}`, { cookie: ownerA.cookie })
  assert.equal((await read.json()).simbolo, '°C')
  const updated = await request(`/api/cadastros/unidademedida/${item.Id}`, {
    method: 'PUT', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'graus Celsius', simbolo: 'degC' },
  })
  assert.equal((await updated.json()).simbolo, 'degC')
  const deleted = await request(`/api/cadastros/unidademedida/${item.Id}`, { method: 'DELETE', cookie: ownerA.cookie, csrf: ownerA.csrf })
  assert.equal(deleted.status, 204)
  assert.equal((await request(`/api/cadastros/unidademedida/${item.Id}`, { cookie: ownerA.cookie })).status, 404)
})

test('safra, equipamento, tipo e medição aceitam apenas referências válidas do mesmo cliente', async () => {
  const fotoSafra = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')}`
  const post = (tipo, payload) => request(`/api/cadastros/${tipo}`, { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf, body: payload })
  const safraResponse = await post('safra', { nomeSafra: '2026/27', dataInicio: '2026-04-01', dataFim: '2027-03-31', foto: fotoSafra })
  assert.equal(safraResponse.status, 201)
  const safra = await safraResponse.json()
  const unidade = await (await post('unidade', { nome: 'Fazenda Aurora' })).json()
  const equipamento = await (await post('equipamento', { nome: 'Estação meteorológica', unidade: unidade.Id })).json()
  const medida = await (await post('unidademedida', { nome: 'graus Celsius', simbolo: '°C' })).json()
  const tipo = await (await post('tipoinformacao', { nome: 'temperatura do ar', unidadeMedida: medida.Id })).json()
  const medicaoResponse = await post('medicao', {
    safra: safra.Id, equipamento: equipamento.Id, tipoInformacao: tipo.Id,
    valor: '24.5', data: '2026-04-15T08:00',
  })
  assert.equal(medicaoResponse.status, 201)
  const medicao = await medicaoResponse.json()
  const lida = await request(`/api/cadastros/medicao/${medicao.Id}`, { cookie: ownerA.cookie })
  assert.equal((await lida.json()).valor, '24.5')
  const removeSafraAntesDaMedicao = await request(`/api/cadastros/safra/${safra.Id}`, { method: 'DELETE', cookie: ownerA.cookie, csrf: ownerA.csrf })
  assert.equal(removeSafraAntesDaMedicao.status, 409)
  const invalidDate = await post('safra', { nomeSafra: 'inválida', dataInicio: '2027-01-01', dataFim: '2026-01-01', foto: fotoSafra })
  assert.equal(invalidDate.status, 400)
})

test('foto de perfil persiste na conta e logout invalida a sessão', async () => {
  const foto = `data:image/png;base64,${Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64')}`
  const update = await request('/api/auth/profile', { method: 'PATCH', cookie: ownerA.cookie, csrf: ownerA.csrf, body: { nome: 'Responsável atualizado', foto } })
  assert.equal(update.status, 200)
  const afterRefresh = await request('/api/auth/session', { cookie: ownerA.cookie })
  const profile = (await afterRefresh.json()).user
  assert.equal(profile.foto, foto)
  assert.deepEqual(profile.favoritos, [])
  const logout = await request('/api/auth/logout', { method: 'POST', cookie: ownerA.cookie, csrf: ownerA.csrf })
  assert.equal(logout.status, 204)
  const protectedRoute = await request('/api/indicador', { cookie: ownerA.cookie })
  assert.equal(protectedRoute.status, 401)
})
