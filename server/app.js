import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SESSION_SECONDS = 60 * 60 * 8
const MAX_BODY_BYTES = 12 * 1024 * 1024
const reportPadrao = 'https://app.powerbi.com/reportEmbed?reportId=022d42c1-d543-4a0d-9bd8-f3ac742a7ff1&autoAuth=true&ctid=b1051c4b-3b94-41ab-9441-e73a72342fdd'
const kinds = new Set(['safra', 'unidade', 'equipamento', 'medicao', 'unidademedida', 'tipoinformacao'])
const relations = {
  equipamento: { unidade: 'unidade' },
  tipoinformacao: { unidadeMedida: 'unidademedida' },
  medicao: { safra: 'safra', equipamento: 'equipamento', tipoInformacao: 'tipoinformacao' },
}
const limits = new Map()

function digest(value) { return createHash('sha256').update(value).digest('hex') }
function equalHash(a, b) {
  const left = Buffer.from(String(a || ''))
  const right = Buffer.from(String(b || ''))
  return left.length === right.length && timingSafeEqual(left, right)
}
function cookieValue(request, name) {
  const cookie = request.headers.cookie || ''
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return decodeURIComponent(value.join('='))
  }
  return ''
}
function json(response, status, body, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders })
  response.end(body === null ? '' : JSON.stringify(body))
}
function error(response, status, message) { json(response, status, { message }) }
function setAuthCookies(response, session, csrf, secure) {
  const secureFlag = secure ? '; Secure' : ''
  response.setHeader('Set-Cookie', [
    `plume_session=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secureFlag}`,
    `plume_csrf=${encodeURIComponent(csrf)}; Path=/; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secureFlag}`,
  ])
}
function clearCookies(response, secure) {
  const secureFlag = secure ? '; Secure' : ''
  response.setHeader('Set-Cookie', [
    `plume_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`,
    `plume_csrf=; Path=/; SameSite=Strict; Max-Age=0${secureFlag}`,
  ])
}
function userView(user) {
  let favoritos = []
  try { favoritos = JSON.parse(user.favorites_json || '[]') } catch { favoritos = [] }
  return { id: user.id, organizationId: user.organization_id, nome: user.name, email: user.email, role: user.role, foto: user.photo_data || null, favoritos }
}
function validPowerBiUrl(value, trustedHosts = []) {
  try {
    const url = new URL(value)
    const allowedHost = url.hostname === 'app.powerbi.com' || trustedHosts.includes(url.hostname)
    const reportId = url.searchParams.get('reportId')
    const tenantId = url.searchParams.get('ctid')
    return url.protocol === 'https:' && allowedHost && url.pathname === '/reportEmbed' &&
      /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(reportId || '') &&
      /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tenantId || '')
  } catch { return false }
}
function imageIsValid(value) {
  if (value === null || value === '') return true
  if (typeof value !== 'string') return false
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/]+={0,2})$/.exec(value)
  if (!match) return false
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > 8 * 1024 * 1024) return false
  if (match[1] === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (match[1] === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
}
async function readBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('o envio ultrapassa o limite de 12 MB.'), { status: 413 })
    chunks.push(chunk)
  }
  if (!bytes) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw Object.assign(new Error('envie um JSON válido.'), { status: 400 }) }
}
function limitLogin(request, email) {
  const now = Date.now()
  const key = `${request.socket.remoteAddress || 'unknown'}:${email}`
  const current = limits.get(key)
  if (!current || current.until <= now) { limits.set(key, { count: 1, until: now + 15 * 60_000 }); return false }
  current.count += 1
  return current.count > 8
}
function recordView(row) { return { Id: row.id, ...JSON.parse(row.payload) } }

export function createApiHandler({ db, secureCookies = process.env.NODE_ENV === 'production', trustedPowerBiHosts = [], defaultPowerBiUrl = process.env.POWERBI_DEFAULT_EMBED_URL || reportPadrao }) {
  const nowIso = () => new Date().toISOString()
  const ownRecord = db.prepare('SELECT id, payload FROM records WHERE id = ? AND organization_id = ? AND kind = ?')
  const listRecords = db.prepare('SELECT id, payload FROM records WHERE organization_id = ? AND kind = ? ORDER BY id')

  return async function apiHandler(request, response) {
    const url = new URL(request.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/')) return false
    response.setHeader('Referrer-Policy', 'same-origin')
    response.setHeader('X-Frame-Options', 'DENY')
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    if (request.method === 'OPTIONS') return json(response, 204, null, { Allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' })

    const startMs = Date.now()
    const pathname = url.pathname.replace(/\/$/, '')
    try {
      let body = {}
      if (!['GET', 'HEAD'].includes(request.method)) body = await readBody(request)
      if (!body || typeof body !== 'object' || Array.isArray(body)) return error(response, 400, 'envie um objeto JSON para a operação.')

      if (pathname === '/api/health' && request.method === 'GET') return json(response, 200, { status: 'ok' })

      if (pathname === '/api/auth/register' && request.method === 'POST') {
        const name = String(body.nome || '').trim()
        const email = String(body.email || '').trim().toLowerCase()
        const organization = String(body.organizationName || '').trim()
        if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || organization.length < 2 || organization.length > 160 || typeof body.senha !== 'string' || body.senha.length < 12 || body.senha.length > 200) {
          return error(response, 400, 'informe nome, e-mail, organização e uma senha de 12 a 200 caracteres.')
        }
        if (limitLogin(request, 'signup')) return error(response, 429, 'muitas solicitações. aguarde 15 minutos e tente novamente.')
        const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)
        if (existing) return error(response, 409, 'não foi possível concluir o cadastro com esses dados.')
        const salt = randomBytes(16).toString('hex')
        const hash = (await scrypt(body.senha, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex')
        const user = { id: cryptoRandomId(), organization_id: cryptoRandomId(), name, email, password_hash: `${salt}:${hash}`, role: 'owner', photo_data: null, created_at: nowIso() }
        const token = randomBytes(32).toString('base64url')
        const csrf = randomBytes(32).toString('base64url')
        db.exec('BEGIN IMMEDIATE')
        try {
          db.prepare('INSERT INTO organizations (id, name, created_at) VALUES (?, ?, ?)').run(user.organization_id, organization, user.created_at)
          db.prepare('INSERT INTO users (id, organization_id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(user.id, user.organization_id, user.name, user.email, user.password_hash, user.role, user.created_at)
          if (validPowerBiUrl(defaultPowerBiUrl, trustedPowerBiHosts)) {
            db.prepare('INSERT INTO records (organization_id, kind, payload, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.organization_id, 'indicador', JSON.stringify({ Nome: 'Dashboard mobile', Descricao: 'Painel Power BI configurado para esta instalação.', Url: new URL(defaultPowerBiUrl).toString() }), user.id, user.created_at, user.created_at)
          }
          db.prepare('INSERT INTO sessions (id, user_id, token_hash, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(cryptoRandomId(), user.id, digest(token), digest(csrf), Date.now() + SESSION_SECONDS * 1000, user.created_at)
          db.exec('COMMIT')
        } catch (cause) { db.exec('ROLLBACK'); if (String(cause).includes('UNIQUE')) return error(response, 409, 'não foi possível concluir o cadastro com esses dados.'); throw cause }
        setAuthCookies(response, token, csrf, secureCookies)
        return json(response, 201, { user: userView(user) })
      }

      if (pathname === '/api/auth/login' && request.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase()
        if (limitLogin(request, email)) return error(response, 429, 'muitas tentativas. aguarde 15 minutos e tente novamente.')
        const user = db.prepare('SELECT * FROM users WHERE email = ? ORDER BY created_at LIMIT 1').get(email)
        const [salt = '', expected = ''] = String(user?.password_hash || '').split(':')
        const actual = (await scrypt(String(body.senha || ''), salt || '00000000000000000000000000000000', 64, { N: 16384, r: 8, p: 1 })).toString('hex')
        if (!user || !equalHash(actual, expected)) return error(response, 401, 'e-mail ou senha inválidos.')
        limits.delete(`${request.socket.remoteAddress || 'unknown'}:${email}`)
        const token = randomBytes(32).toString('base64url')
        const csrf = randomBytes(32).toString('base64url')
        db.prepare('INSERT INTO sessions (id, user_id, token_hash, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(cryptoRandomId(), user.id, digest(token), digest(csrf), Date.now() + SESSION_SECONDS * 1000, nowIso())
        setAuthCookies(response, token, csrf, secureCookies)
        return json(response, 200, { user: userView(user) })
      }

      const sessionToken = cookieValue(request, 'plume_session')
      const csrfCookie = cookieValue(request, 'plume_csrf')
      const session = sessionToken ? db.prepare(`SELECT s.id AS session_id, s.csrf_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`).get(digest(sessionToken)) : null
      const authenticated = session && session.expires_at > Date.now() ? session : null

      if (pathname === '/api/auth/session' && request.method === 'GET') {
        if (session && !authenticated) db.prepare('DELETE FROM sessions WHERE id = ?').run(session.session_id)
        if (!authenticated) return json(response, 200, { user: null })
        return json(response, 200, { user: userView(authenticated), csrfToken: csrfCookie })
      }
      if (!authenticated) return error(response, 401, 'autenticação necessária.')
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        const origin = request.headers.origin
        if (origin && request.headers['sec-fetch-site'] === 'cross-site') return error(response, 403, 'origem não autorizada.')
        const csrfHeader = request.headers['x-csrf-token']
        if (!csrfCookie || !csrfHeader || !equalHash(csrfCookie, csrfHeader) || !equalHash(digest(csrfCookie), authenticated.csrf_hash)) return error(response, 403, 'token de proteção da sessão ausente ou inválido.')
      }

      if (pathname === '/api/auth/logout' && request.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(authenticated.session_id)
        clearCookies(response, secureCookies)
        return json(response, 204, null)
      }
      if (pathname === '/api/auth/profile' && request.method === 'PATCH') {
        const name = body.nome === undefined ? authenticated.name : String(body.nome).trim()
        const photo = Object.hasOwn(body, 'foto') ? body.foto || null : authenticated.photo_data
        let favorites = []
        try { favorites = JSON.parse(authenticated.favorites_json || '[]') } catch { favorites = [] }
        if (Object.hasOwn(body, 'favoritos')) {
          if (!Array.isArray(body.favoritos) || body.favoritos.length > 500 || body.favoritos.some((id) => !Number.isSafeInteger(Number(id)))) return error(response, 400, 'a lista de favoritos é inválida.')
          const uniqueIds = [...new Set(body.favoritos.map(Number))]
          const queryIndicator = db.prepare("SELECT 1 FROM records WHERE id = ? AND organization_id = ? AND kind = 'indicador'")
          if (uniqueIds.some((id) => !queryIndicator.get(id, authenticated.organization_id))) return error(response, 400, 'um indicador favorito não pertence à sua organização.')
          favorites = uniqueIds
        }
        if (name.length < 2 || name.length > 120 || !imageIsValid(photo)) return error(response, 400, 'informe nome válido e uma foto PNG, JPEG ou WebP de até 8 MB.')
        db.prepare('UPDATE users SET name = ?, photo_data = ?, favorites_json = ? WHERE id = ?').run(name, photo, JSON.stringify(favorites), authenticated.id)
        return json(response, 200, { user: userView(db.prepare('SELECT * FROM users WHERE id = ?').get(authenticated.id)) })
      }

      const indicatorMatch = pathname.match(/^\/api\/indicador(?:\/(\d+))?$/)
      const recordMatch = pathname.match(/^\/api\/cadastros\/([a-z]+)(?:\/(\d+))?$/)
      const kind = indicatorMatch ? 'indicador' : recordMatch && kinds.has(recordMatch[1]) ? recordMatch[1] : null
      const recordId = indicatorMatch?.[1] || recordMatch?.[2]
      if (!kind) return error(response, 404, 'rota não encontrada.')
      if (['GET', 'HEAD'].includes(request.method)) {
        if (recordId) {
          const row = ownRecord.get(Number(recordId), authenticated.organization_id, kind)
          if (!row) return error(response, 404, 'registro não encontrado.')
          return json(response, 200, recordView(row))
        }
        return json(response, 200, listRecords.all(authenticated.organization_id, kind).map(recordView))
      }
      if (!['POST', 'PUT', 'DELETE'].includes(request.method)) return error(response, 405, 'método não permitido.')
      if (kind === 'indicador' && request.method !== 'DELETE') {
        const { Nome, Descricao, Url } = body
        if (typeof Nome !== 'string' || !Nome.trim() || Nome.trim().length > 160 || typeof Descricao !== 'string' || !Descricao.trim() || Descricao.trim().length > 2000 || !validPowerBiUrl(Url, trustedPowerBiHosts)) return error(response, 400, 'informe nome, descrição e URL reportEmbed válida do Power BI com reportId e ctid.')
      } else if (request.method !== 'DELETE') {
        const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
        if (!Object.keys(payload).length || JSON.stringify(payload).length > 10 * 1024 * 1024) return error(response, 400, 'informe os campos do registro.')
        const required = {
          safra: ['nomeSafra', 'dataInicio', 'dataFim', 'foto'],
          unidade: ['nome'],
          equipamento: ['nome', 'unidade'],
          medicao: ['safra', 'equipamento', 'tipoInformacao', 'valor', 'data'],
          unidademedida: ['nome', 'simbolo'],
          tipoinformacao: ['nome', 'unidadeMedida'],
        }[kind]
        if (required.some((field) => payload[field] === undefined || payload[field] === '')) return error(response, 400, 'preencha todos os campos obrigatórios.')
        if (kind === 'safra' && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dataFim) || payload.dataFim < payload.dataInicio)) return error(response, 400, 'informe um intervalo de datas válido para a safra.')
        if (kind === 'medicao' && (!Number.isFinite(Number(payload.valor)) || !Number.isFinite(Date.parse(payload.data)))) return error(response, 400, 'informe um valor numérico e uma data válidos para a medição.')
        for (const [field, relationKind] of Object.entries(relations[kind] || {})) {
          if (payload[field] === undefined || payload[field] === '') continue
          const relation = ownRecord.get(Number(payload[field]), authenticated.organization_id, relationKind)
          if (!Number.isSafeInteger(Number(payload[field])) || !relation) return error(response, 400, `a referência de ${field} não pertence à sua organização.`)
        }
        if (Object.hasOwn(payload, 'foto') && !imageIsValid(payload.foto)) return error(response, 400, 'a imagem deve ser PNG, JPEG ou WebP e ter até 8 MB.')
        for (const field of Object.keys(relations[kind] || {})) if (payload[field] !== undefined) payload[field] = Number(payload[field])
      }
      const stamp = nowIso()
      if (request.method === 'POST') {
        const result = db.prepare('INSERT INTO records (organization_id, kind, payload, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(authenticated.organization_id, kind, JSON.stringify(kind === 'indicador' ? { Nome: body.Nome.trim(), Descricao: body.Descricao.trim(), Url: new URL(body.Url).toString() } : body), authenticated.id, stamp, stamp)
        return json(response, 201, recordView({ id: Number(result.lastInsertRowid), payload: JSON.stringify(kind === 'indicador' ? { Nome: body.Nome.trim(), Descricao: body.Descricao.trim(), Url: new URL(body.Url).toString() } : body) }))
      }
      const current = ownRecord.get(Number(recordId), authenticated.organization_id, kind)
      if (!current) return error(response, 404, 'registro não encontrado.')
      if (request.method === 'DELETE') {
        for (const [parentKind, fields] of Object.entries(relations)) {
          for (const [field, relatedKind] of Object.entries(fields)) {
            if (relatedKind !== kind) continue
            const dependency = db.prepare(`SELECT 1 FROM records WHERE organization_id = ? AND kind = ? AND json_extract(payload, '$.${field}') = ? LIMIT 1`).get(authenticated.organization_id, parentKind, Number(recordId))
            if (dependency) return error(response, 409, 'este registro ainda está associado a outros dados.')
          }
        }
        if (kind === 'indicador') {
          const users = db.prepare('SELECT id, favorites_json FROM users WHERE organization_id = ?').all(authenticated.organization_id)
          const updateFavorites = db.prepare('UPDATE users SET favorites_json = ? WHERE id = ?')
          for (const user of users) {
            let favorites = []
            try { favorites = JSON.parse(user.favorites_json || '[]') } catch { favorites = [] }
            updateFavorites.run(JSON.stringify(favorites.filter((id) => String(id) !== String(recordId))), user.id)
          }
        }
        db.prepare('DELETE FROM records WHERE id = ? AND organization_id = ? AND kind = ?').run(Number(recordId), authenticated.organization_id, kind)
        return json(response, 204, null)
      }
      db.prepare('UPDATE records SET payload = ?, updated_at = ? WHERE id = ? AND organization_id = ? AND kind = ?').run(JSON.stringify(kind === 'indicador' ? { Nome: body.Nome.trim(), Descricao: body.Descricao.trim(), Url: new URL(body.Url).toString() } : body), stamp, Number(recordId), authenticated.organization_id, kind)
      return json(response, 200, recordView({ id: Number(recordId), payload: JSON.stringify(kind === 'indicador' ? { Nome: body.Nome.trim(), Descricao: body.Descricao.trim(), Url: new URL(body.Url).toString() } : body) }))
    } catch (cause) {
      if (cause.status) return error(response, cause.status, cause.message)
      if (cause.code === 'ERR_SQLITE_ERROR') return error(response, 500, 'não foi possível concluir a operação no armazenamento.')
      return error(response, 500, 'erro interno do serviço.')
    } finally {
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        const ms = Date.now() - startMs
        process.stdout.write(`[${new Date().toISOString()}] ${request.method} ${pathname} - ${ms}ms\n`)
      }
    }
  }
}

export function startSessionCleanup(db) {
  const cleanup = db.prepare('DELETE FROM sessions WHERE expires_at <= ?')
  return setInterval(() => {
    try { cleanup.run(Date.now()) } catch { /* ignore */ }
  }, 60 * 60 * 1000)
}

function cryptoRandomId() { return randomBytes(16).toString('hex') }
