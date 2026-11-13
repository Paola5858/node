import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { preserveOriginal, retrieveOriginal } from './objectStorage.js'
import { withSecurityContext } from './database.js'
import { parseImportFile, suggestColumnMapping, validateColumnMapping } from './importPipeline.js'
import {
  accessRoles,
  hasFrontScope,
  hasPermission,
  hasUnitScope,
  isOperationalOrIntern,
  isStrategicAdmin,
  provisionOrganizationAuthorization,
  resolveSecurityContext,
} from './authorization.js'

const scrypt = promisify(scryptCallback)
const SESSION_SECONDS = 60 * 60 * 8
const MAX_BODY_BYTES = 14 * 1024 * 1024
const reportPadrao = 'https://app.powerbi.com/view?r=eyJrIjoiYzBjZTIzNDQtNjcxNi00NmEwLTg1NzQtMDQ3YWE3M2ZkZDEwIiwidCI6ImIxMDUxYzRiLTNiOTQtNDFhYi05NDQxLWU3M2E3MjM0MmZkZCJ9'
const kinds = new Set(['safra', 'unidade', 'frente', 'equipamento', 'medicao', 'unidademedida', 'tipoinformacao'])
const relations = {
  frente: { unidade: 'unidade' },
  equipamento: { unidade: 'unidade', frente: 'frente' },
  tipoinformacao: { unidadeMedida: 'unidademedida' },
  medicao: { safra: 'safra', equipamento: 'equipamento', tipoInformacao: 'tipoinformacao' },
}
const recordTables = {
  safra: 'harvests',
  unidade: 'units',
  frente: 'fronts',
  equipamento: 'equipment',
  medicao: 'measurements',
  unidademedida: 'unit_of_measure',
  tipoinformacao: 'indicator_definitions',
}
const permissionModules = {
  indicador: 'analytics',
  safra: 'harvests',
  unidade: 'units',
  frente: 'units',
  equipamento: 'equipment',
  medicao: 'measurements',
  unidademedida: 'catalogs',
  tipoinformacao: 'catalogs',
}
const limits = new Map()

function digest(value) { return createHash('sha256').update(value).digest('hex') }
function hasControlCharacter(value) { return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) }
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
function userView(user, accessContext = {}) {
  let favoritos = []
  try { favoritos = Array.isArray(user.favorites_json) ? user.favorites_json : JSON.parse(user.favorites_json || '[]') } catch { favoritos = [] }
  return {
    id: user.id,
    organizationId: user.organization_id,
    nome: user.name,
    email: user.email,
    role: user.role,
    department: accessContext.department || user.department || null,
    accessLevel: accessContext.accessLevel || user.access_level || null,
    unitIds: accessContext.allowedUnitIds || [],
    frontIds: accessContext.allowedFrontIds || [],
    permissions: accessContext.permissionCodes || [],
    roles: accessContext.roleNames || [],
    foto: user.photo_data || null,
    favoritos,
  }
}
function validPowerBiUrl(value, trustedHosts = []) {
  try {
    const url = new URL(value)
    const allowedHost = url.hostname === 'app.powerbi.com' || trustedHosts.includes(url.hostname)
    const reportId = url.searchParams.get('reportId')
    const tenantId = url.searchParams.get('ctid')
    const publicToken = url.searchParams.get('r') || ''
    const publicLink = url.pathname === '/view' && /^[A-Za-z\d_-]{20,2048}$/.test(publicToken)
    const reportEmbed = url.pathname === '/reportEmbed' &&
      /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(reportId || '') &&
      /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(tenantId || '')
    return url.protocol === 'https:' && allowedHost && (publicLink || reportEmbed)
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
async function archiveImage(organizationId, value) {
  if (!value) return null
  const [, mediaType, encoded] = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/]+={0,2})$/.exec(value)
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mediaType]
  return preserveOriginal({
    organizationId,
    fileName: `original.${extension}`,
    contentType: mediaType,
    bytes: Buffer.from(encoded, 'base64'),
  })
}
async function readBody(request) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > MAX_BODY_BYTES) throw Object.assign(new Error('o envio ultrapassa o limite de 14 MB.'), { status: 413 })
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
function recordView(row) {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
  return { Id: Number(row.id), ...payload }
}
function payloadFor(kind, body) {
  return kind === 'indicador'
    ? { Nome: body.Nome.trim(), Descricao: body.Descricao.trim(), Url: new URL(body.Url).toString() }
    : body
}
function publicPayload(payload) {
  const { _photoObjectKey, _unitSymbol, ...value } = payload
  return value
}
function forbidden(response) {
  return error(response, 403, 'permissão insuficiente para esta operação.')
}
function csvCell(value) {
  let text = String(value ?? '')
  if (/^[\t\r ]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
async function getRecord(db, kind, id, organizationId) {
  if (kind === 'indicador') {
    const result = await db.query(
      'SELECT id, jsonb_build_object(\'Nome\', name, \'Descricao\', description, \'Url\', url) AS payload FROM dashboard_reports WHERE id = $1 AND organization_id = $2',
      [id, organizationId], organizationId,
    )
    return result.rows[0]
  }
  const table = recordTables[kind]
  if (!table) return null
  const result = await db.query(`SELECT id, attributes AS payload FROM ${table} WHERE id = $1 AND organization_id = $2`, [id, organizationId], organizationId)
  return result.rows[0]
}
async function listRecords(db, kind, organizationId) {
  if (kind === 'indicador') {
    const result = await db.query(
      'SELECT id, jsonb_build_object(\'Nome\', name, \'Descricao\', description, \'Url\', url) AS payload FROM dashboard_reports WHERE organization_id = $1 ORDER BY id',
      [organizationId], organizationId,
    )
    return result.rows
  }
  const result = await db.query(`SELECT id, attributes AS payload FROM ${recordTables[kind]} WHERE organization_id = $1 ORDER BY id`, [organizationId], organizationId)
  return result.rows
}
async function insertRecord(db, kind, payload, user, organizationId, stamp) {
  const jsonPayload = JSON.stringify(publicPayload(payload))
  const queries = {
    safra: ['INSERT INTO harvests (organization_id, name, starts_on, ends_on, unit_id, photo_object_key, attributes) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING id',
      [organizationId, payload.nomeSafra, payload.dataInicio, payload.dataFim, payload.unitId || null, payload._photoObjectKey || null, jsonPayload]],
    unidade: ['INSERT INTO units (organization_id, name, attributes) VALUES ($1, $2, $3::jsonb) RETURNING id', [organizationId, payload.nome, jsonPayload]],
    frente: ['INSERT INTO fronts (organization_id, name, unit_id, attributes) VALUES ($1, $2, $3, $4::jsonb) RETURNING id',
      [organizationId, payload.nome, payload.unidade, jsonPayload]],
    equipamento: ['INSERT INTO equipment (organization_id, name, unit_id, front_id, attributes) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id', [organizationId, payload.nome, payload.unidade, payload.frente || null, jsonPayload]],
    unidademedida: ['INSERT INTO unit_of_measure (organization_id, name, symbol, attributes) VALUES ($1, $2, $3, $4::jsonb) RETURNING id', [organizationId, payload.nome, payload.simbolo, jsonPayload]],
    tipoinformacao: ['INSERT INTO indicator_definitions (organization_id, name, unit_of_measure_id, attributes) VALUES ($1, $2, $3, $4::jsonb) RETURNING id', [organizationId, payload.nome, payload.unidadeMedida, jsonPayload]],
  }
  if (kind === 'indicador') {
    const result = await db.query(
      'INSERT INTO dashboard_reports (organization_id, name, description, url, created_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id',
      [organizationId, payload.Nome, payload.Descricao, payload.Url, user.id, stamp], organizationId,
    )
    return result.rows[0].id
  }
  if (kind === 'medicao') {
    const result = await db.query(
      `INSERT INTO measurements (
        organization_id, harvest_id, equipment_id, unit_id, indicator_id, valor_original, unidade_original,
        valor_normalizado, unidade_normalizada, regra_aplicada, versao_processamento, responsavel_ou_processo,
        measured_at, received_at, processed_at, released_at, attributes
      ) VALUES ($1,$2,$3,(SELECT unit_id FROM equipment WHERE organization_id=$1 AND id=$3),$4,$5,$6,$7,$8,NULL,'legacy-api-v1','api',$9,$10,$10,$10,$11::jsonb) RETURNING id`,
      [organizationId, payload.safra, payload.equipamento, payload.tipoInformacao, String(payload.valor), payload._unitSymbol || '',
        Number(payload.valor), payload._unitSymbol || '', payload.data, stamp, jsonPayload], organizationId,
    )
    return result.rows[0].id
  }
  const [sql, values] = queries[kind]
  const result = await db.query(sql, values, organizationId)
  return result.rows[0].id
}
async function updateRecord(db, kind, id, payload, organizationId, stamp) {
  if (kind === 'indicador') {
    await db.query(
      'UPDATE dashboard_reports SET name = $1, description = $2, url = $3, updated_at = $4 WHERE id = $5 AND organization_id = $6',
      [payload.Nome, payload.Descricao, payload.Url, stamp, id, organizationId], organizationId,
    )
    return
  }
  const table = recordTables[kind]
  const fields = {
    safra: ['name = $1, starts_on = $2, ends_on = $3, unit_id = $4, photo_object_key = $5, attributes = $6::jsonb', [payload.nomeSafra, payload.dataInicio, payload.dataFim, payload.unitId || null, payload._photoObjectKey || null]],
    unidade: ['name = $1, attributes = $2::jsonb', [payload.nome]],
    frente: ['name = $1, unit_id = $2, attributes = $3::jsonb', [payload.nome, payload.unidade]],
    equipamento: ['name = $1, unit_id = $2, front_id = $3, attributes = $4::jsonb', [payload.nome, payload.unidade, payload.frente || null]],
    unidademedida: ['name = $1, symbol = $2, attributes = $3::jsonb', [payload.nome, payload.simbolo]],
    tipoinformacao: ['name = $1, unit_of_measure_id = $2, attributes = $3::jsonb', [payload.nome, payload.unidadeMedida]],
  }[kind]
  const [set, values] = fields
  await db.query(`UPDATE ${table} SET ${set} WHERE id = $${values.length + 2} AND organization_id = $${values.length + 3}`,
    [...values, JSON.stringify(publicPayload(payload)), id, organizationId], organizationId)
}

export function createApiHandler({
  db,
  secureCookies = process.env.NODE_ENV === 'production',
  trustedPowerBiHosts = [],
  defaultPowerBiUrl = process.env.POWERBI_DEFAULT_EMBED_URL || reportPadrao,
  preserveOriginalFn = preserveOriginal,
  retrieveOriginalFn = retrieveOriginal,
}) {
  const nowIso = () => new Date().toISOString()

  return function apiHandler(request, response) {
    const requestSecurityContext = {}
    return withSecurityContext(requestSecurityContext, async () => {
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
        const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [email])
        if (existing.rowCount) return error(response, 409, 'não foi possível concluir o cadastro com esses dados.')
        const salt = randomBytes(16).toString('hex')
        const hash = (await scrypt(body.senha, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex')
        const user = {
          id: cryptoRandomId(), organization_id: cryptoRandomId(), name, email,
          password_hash: `${salt}:${hash}`, role: 'owner', department: 'ti',
          access_level: 'strategic', photo_data: null, favorites_json: [], created_at: nowIso(),
        }
        const token = randomBytes(32).toString('base64url')
        const csrf = randomBytes(32).toString('base64url')
        try {
          await db.transaction(async (client) => {
            await client.query('INSERT INTO organizations (id, name, created_at) VALUES ($1, $2, $3)', [user.organization_id, organization, user.created_at])
            await client.query('INSERT INTO users (id, organization_id, name, email, password_hash, role, department, access_level, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
              [user.id, user.organization_id, user.name, user.email, user.password_hash, user.role, user.department, user.access_level, user.created_at])
            await provisionOrganizationAuthorization(client, user.organization_id, user.id)
            if (validPowerBiUrl(defaultPowerBiUrl, trustedPowerBiHosts)) {
              await client.query('INSERT INTO dashboard_reports (organization_id, name, description, url, created_by) VALUES ($1,$2,$3,$4,$5)',
                [user.organization_id, 'Dashboard mobile', 'Painel Power BI configurado para esta instalação.', new URL(defaultPowerBiUrl).toString(), user.id])
            }
            await client.query('INSERT INTO sessions (id,user_id,token_hash,csrf_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
              [cryptoRandomId(), user.id, digest(token), digest(csrf), Date.now() + SESSION_SECONDS * 1000, user.created_at])
          }, {
            organizationId: user.organization_id,
            userId: user.id,
            allowedUnitIds: ['*'],
            allowedFrontIds: ['*'],
            permissionCodes: ['users:can_write', 'reports:can_write'],
            accessLevel: 'strategic',
            department: 'ti',
          })
        } catch (cause) {
          if (cause.code === '23505') return error(response, 409, 'não foi possível concluir o cadastro com esses dados.')
          throw cause
        }
        const accessContext = await resolveSecurityContext(db, user)
        setAuthCookies(response, token, csrf, secureCookies)
        return json(response, 201, { user: userView(user, accessContext) })
      }

      if (pathname === '/api/auth/login' && request.method === 'POST') {
        const email = String(body.email || '').trim().toLowerCase()
        if (limitLogin(request, email)) return error(response, 429, 'muitas tentativas. aguarde 15 minutos e tente novamente.')
        const result = await db.query('SELECT * FROM users WHERE email = $1 ORDER BY created_at LIMIT 1', [email])
        const user = result.rows[0]
        const [salt = '', expected = ''] = String(user?.password_hash || '').split(':')
        const actual = (await scrypt(String(body.senha || ''), salt || '00000000000000000000000000000000', 64, { N: 16384, r: 8, p: 1 })).toString('hex')
        if (!user || !equalHash(actual, expected)) return error(response, 401, 'e-mail ou senha inválidos.')
        limits.delete(`${request.socket.remoteAddress || 'unknown'}:${email}`)
        const token = randomBytes(32).toString('base64url')
        const csrf = randomBytes(32).toString('base64url')
        await db.query('INSERT INTO sessions (id,user_id,token_hash,csrf_hash,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [cryptoRandomId(), user.id, digest(token), digest(csrf), Date.now() + SESSION_SECONDS * 1000, nowIso()])
        const accessContext = await resolveSecurityContext(db, user)
        setAuthCookies(response, token, csrf, secureCookies)
        return json(response, 200, { user: userView(user, accessContext) })
      }

      const sessionToken = cookieValue(request, 'plume_session')
      const csrfCookie = cookieValue(request, 'plume_csrf')
      const sessionResult = sessionToken
        ? await db.query('SELECT s.id AS session_id, s.csrf_hash, s.expires_at, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1', [digest(sessionToken)])
        : { rows: [] }
      const session = sessionResult.rows[0]
      const authenticated = session && Number(session.expires_at) > Date.now() ? session : null
      if (session && !authenticated && pathname === '/api/auth/session' && request.method === 'GET') {
        await db.query('DELETE FROM sessions WHERE id = $1', [session.session_id])
      }
      if (pathname === '/api/auth/session' && request.method === 'GET' && !authenticated) return json(response, 200, { user: null })
      if (!authenticated) return error(response, 401, 'autenticação necessária.')
      const organizationId = authenticated.organization_id
      const accessContext = await resolveSecurityContext(db, authenticated)
      Object.assign(requestSecurityContext, accessContext)
      if (pathname === '/api/auth/session' && request.method === 'GET') {
        return json(response, 200, { user: userView(authenticated, accessContext), csrfToken: csrfCookie })
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
        if (request.headers.origin && request.headers['sec-fetch-site'] === 'cross-site') return error(response, 403, 'origem não autorizada.')
        const csrfHeader = request.headers['x-csrf-token']
        if (!csrfCookie || !csrfHeader || !equalHash(csrfCookie, csrfHeader) || !equalHash(digest(csrfCookie), authenticated.csrf_hash)) return error(response, 403, 'token de proteção da sessão ausente ou inválido.')
      }
      if (pathname === '/api/auth/logout' && request.method === 'POST') {
        await db.query('DELETE FROM sessions WHERE id = $1', [authenticated.session_id])
        clearCookies(response, secureCookies)
        return json(response, 204, null)
      }
      if (pathname === '/api/admin/users' && request.method === 'POST') {
        if (!isStrategicAdmin(accessContext) || !hasPermission(accessContext, 'users', 'can_write')) return forbidden(response)
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
        const password = body.password
        const departments = ['qualidade', 'laboratorio', 'agricola', 'industrial', 'ti']
        const levels = ['operational', 'tactical', 'strategic']
        const roleName = body.roleName
        if (name.length < 2 || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 200 ||
          !departments.includes(body.department) || !levels.includes(body.accessLevel) ||
          !['operational', 'intern', 'tactical', 'strategic'].includes(roleName) ||
          accessRoles[roleName] !== body.accessLevel) {
          return error(response, 400, 'informe nome, e-mail, senha e perfil organizacional válidos.')
        }
        const parseIds = (value) => {
          if (!Array.isArray(value) || value.length > 500) return null
          const ids = value.map(Number)
          if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null
          return [...new Set(ids)]
        }
        const unitIds = parseIds(body.unitIds)
        const frontIds = parseIds(body.frontIds)
        if (!unitIds || !frontIds) return error(response, 400, 'as unidades e frentes devem ser listas de identificadores válidos.')
        const units = unitIds.length
          ? await db.query('SELECT id FROM units WHERE organization_id=$1 AND id=ANY($2::bigint[])', [organizationId, unitIds], organizationId)
          : { rows: [] }
        const fronts = frontIds.length
          ? await db.query('SELECT id, unit_id FROM fronts WHERE organization_id=$1 AND id=ANY($2::bigint[])', [organizationId, frontIds], organizationId)
          : { rows: [] }
        if (units.rowCount !== unitIds.length || fronts.rowCount !== frontIds.length ||
          fronts.rows.some((front) => front.unit_id !== null && !unitIds.includes(Number(front.unit_id)))) {
          return error(response, 400, 'uma unidade ou frente não pertence ao escopo informado.')
        }
        const salt = randomBytes(16).toString('hex')
        const passwordHash = (await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 })).toString('hex')
        const userId = cryptoRandomId()
        await db.transaction(async (client) => {
          await client.query(
            `INSERT INTO users (id, organization_id, name, email, password_hash, role, department, access_level)
             VALUES ($1,$2,$3,$4,$5,'member',$6,$7)`,
            [userId, organizationId, name, email, `${salt}:${passwordHash}`, body.department, body.accessLevel],
          )
          await client.query(
            `INSERT INTO user_roles (organization_id, user_id, role_id)
             SELECT $1,$2,id FROM roles WHERE organization_id=$1 AND name=$3`,
            [organizationId, userId, roleName],
          )
          if (unitIds.length) {
            await client.query(
              'INSERT INTO user_unit_scope (organization_id, user_id, unit_id, assigned_by) SELECT $1,$2,unit_id,$3 FROM unnest($4::bigint[]) AS unit_id',
              [organizationId, userId, authenticated.id, unitIds],
            )
          }
          if (frontIds.length) {
            await client.query(
              'INSERT INTO user_front_scope (organization_id, user_id, front_id, assigned_by) SELECT $1,$2,front_id,$3 FROM unnest($4::bigint[]) AS front_id',
              [organizationId, userId, authenticated.id, frontIds],
            )
          }
          await client.query(
            `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
             VALUES ($1,$2,'user_created','user',$3,$4::jsonb)`,
            [organizationId, authenticated.id, userId, JSON.stringify({ email, department: body.department, accessLevel: body.accessLevel, roleName, unitIds, frontIds })],
          )
        }, accessContext)
        return json(response, 201, { id: userId, name, email, department: body.department, accessLevel: body.accessLevel, roleName, unitIds, frontIds })
      }
      const accessMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/access$/)
      if (accessMatch && request.method === 'PATCH') {
        if (!isStrategicAdmin(accessContext) || !hasPermission(accessContext, 'users', 'can_write')) return forbidden(response)
        const targetUserId = decodeURIComponent(accessMatch[1])
        if (targetUserId === authenticated.id) return error(response, 409, 'o perfil do administrador autenticado não pode ser alterado por esta operação.')
        const departments = ['qualidade', 'laboratorio', 'agricola', 'industrial', 'ti']
        const levels = ['operational', 'tactical', 'strategic']
        const roleName = body.roleName
        if (!departments.includes(body.department) || !levels.includes(body.accessLevel) ||
          !['operational', 'intern', 'tactical', 'strategic'].includes(roleName) ||
          accessRoles[roleName] !== body.accessLevel) {
          return error(response, 400, 'departamento, nível de acesso ou perfil inválido.')
        }
        const parseIds = (value) => {
          if (!Array.isArray(value) || value.length > 500) return null
          const ids = value.map(Number)
          if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) return null
          return [...new Set(ids)]
        }
        const unitIds = parseIds(body.unitIds)
        const frontIds = parseIds(body.frontIds)
        if (!unitIds || !frontIds) return error(response, 400, 'as unidades e frentes devem ser listas de identificadores válidos.')
        const userResult = await db.query(
          'SELECT id, role, department, access_level FROM users WHERE id=$1 AND organization_id=$2',
          [targetUserId, organizationId], organizationId,
        )
        if (!userResult.rowCount) return error(response, 404, 'usuário não encontrado.')
        const units = unitIds.length
          ? await db.query('SELECT id FROM units WHERE organization_id=$1 AND id=ANY($2::bigint[])', [organizationId, unitIds], organizationId)
          : { rows: [] }
        const fronts = frontIds.length
          ? await db.query('SELECT id, unit_id FROM fronts WHERE organization_id=$1 AND id=ANY($2::bigint[])', [organizationId, frontIds], organizationId)
          : { rows: [] }
        if (units.rowCount !== unitIds.length || fronts.rowCount !== frontIds.length ||
          fronts.rows.some((front) => front.unit_id !== null && !unitIds.includes(Number(front.unit_id)))) {
          return error(response, 400, 'uma unidade ou frente não pertence ao escopo informado.')
        }
        const before = {
          department: userResult.rows[0].department,
          accessLevel: userResult.rows[0].access_level,
          unitIds: (await db.query('SELECT unit_id FROM user_unit_scope WHERE organization_id=$1 AND user_id=$2 ORDER BY unit_id',
            [organizationId, targetUserId], organizationId)).rows.map((row) => Number(row.unit_id)),
          frontIds: (await db.query('SELECT front_id FROM user_front_scope WHERE organization_id=$1 AND user_id=$2 ORDER BY front_id',
            [organizationId, targetUserId], organizationId)).rows.map((row) => Number(row.front_id)),
        }
        await db.transaction(async (client) => {
          await client.query('UPDATE users SET department=$1, access_level=$2 WHERE organization_id=$3 AND id=$4',
            [body.department, body.accessLevel, organizationId, targetUserId])
          await client.query('DELETE FROM user_unit_scope WHERE organization_id=$1 AND user_id=$2', [organizationId, targetUserId])
          await client.query('DELETE FROM user_front_scope WHERE organization_id=$1 AND user_id=$2', [organizationId, targetUserId])
          if (unitIds.length) {
            await client.query(
              'INSERT INTO user_unit_scope (organization_id, user_id, unit_id, assigned_by) SELECT $1,$2,unit_id,$3 FROM unnest($4::bigint[]) AS unit_id',
              [organizationId, targetUserId, authenticated.id, unitIds],
            )
          }
          if (frontIds.length) {
            await client.query(
              'INSERT INTO user_front_scope (organization_id, user_id, front_id, assigned_by) SELECT $1,$2,front_id,$3 FROM unnest($4::bigint[]) AS front_id',
              [organizationId, targetUserId, authenticated.id, frontIds],
            )
          }
          await client.query(
            `DELETE FROM user_roles ur USING roles r
             WHERE ur.organization_id=$1 AND ur.user_id=$2 AND r.organization_id=ur.organization_id
               AND r.id=ur.role_id AND r.name <> 'organization_admin'`,
            [organizationId, targetUserId],
          )
          await client.query(
            `INSERT INTO user_roles (organization_id, user_id, role_id)
             SELECT $1,$2,id FROM roles WHERE organization_id=$1 AND name=$3
             ON CONFLICT DO NOTHING`,
            [organizationId, targetUserId, roleName],
          )
          await client.query(
            `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, before_data, after_data)
             VALUES ($1,$2,'user_access_updated','user',$3,$4::jsonb,$5::jsonb)`,
            [organizationId, authenticated.id, targetUserId, JSON.stringify(before),
              JSON.stringify({ department: body.department, accessLevel: body.accessLevel, roleName, unitIds, frontIds })],
          )
        }, accessContext)
        return json(response, 200, { userId: targetUserId, department: body.department, accessLevel: body.accessLevel, roleName, unitIds, frontIds })
      }
      if (pathname === '/api/auth/profile' && request.method === 'PATCH') {
        const name = body.nome === undefined ? authenticated.name : String(body.nome).trim()
        const photo = Object.hasOwn(body, 'foto') ? body.foto || null : authenticated.photo_data
        let favorites = Array.isArray(authenticated.favorites_json) ? authenticated.favorites_json : []
        if (Object.hasOwn(body, 'favoritos')) {
          if (!Array.isArray(body.favoritos) || body.favoritos.length > 500 || body.favoritos.some((id) => !Number.isSafeInteger(Number(id)))) return error(response, 400, 'a lista de favoritos é inválida.')
          const uniqueIds = [...new Set(body.favoritos.map(Number))]
          const rows = uniqueIds.length ? await db.query('SELECT id FROM dashboard_reports WHERE organization_id=$1 AND id=ANY($2::bigint[])', [organizationId, uniqueIds], organizationId) : { rows: [] }
          if (rows.rowCount !== uniqueIds.length) return error(response, 400, 'um indicador favorito não pertence à sua organização.')
          favorites = uniqueIds
        }
        if (name.length < 2 || name.length > 120 || !imageIsValid(photo)) return error(response, 400, 'informe nome válido e uma foto PNG, JPEG ou WebP de até 8 MB.')
        const photoObject = photo && photo !== authenticated.photo_data ? await archiveImage(organizationId, photo) : null
        await db.query('UPDATE users SET name=$1, photo_data=$2, photo_object_key=COALESCE($3,photo_object_key), favorites_json=$4::jsonb WHERE id=$5 AND organization_id=$6',
          [name, photo, photoObject?.key || null, JSON.stringify(favorites), authenticated.id, organizationId], organizationId)
        const updated = await db.query('SELECT * FROM users WHERE id=$1 AND organization_id=$2', [authenticated.id, organizationId], organizationId)
        return json(response, 200, { user: userView(updated.rows[0]) })
      }
      const releaseMatch = pathname.match(/^\/api\/releases\/(measurements|quality-analyses)\/(\d+)$/)
      if (releaseMatch && request.method === 'POST') {
        if (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'quality', 'can_approve_release')) return forbidden(response)
        const [entityType, rawId] = [releaseMatch[1], releaseMatch[2]]
        const id = Number(rawId)
        if (!Number.isSafeInteger(id)) return error(response, 400, 'identificador de liberação inválido.')
        const table = entityType === 'measurements' ? 'measurements' : 'quality_analyses'
        const idColumn = entityType === 'measurements' ? 'measurement_id' : 'quality_analysis_id'
        const target = await db.query(`SELECT id, unit_id FROM ${table} WHERE id=$1 AND organization_id=$2`, [id, organizationId], organizationId)
        if (!target.rowCount) return error(response, 404, 'registro não encontrado.')
        const unitId = target.rows[0].unit_id
        if (unitId === null) return error(response, 409, 'o registro não possui usina vinculada para liberação.')
        if (!hasUnitScope(accessContext, unitId)) return forbidden(response)
        const justification = typeof body.justification === 'string' ? body.justification.trim() : ''
        if (justification.length < 10 || justification.length > 2000) return error(response, 400, 'informe uma justificativa de 10 a 2000 caracteres.')
        await db.transaction(async (client) => {
          await client.query(
            `INSERT INTO release_approvals (organization_id, ${idColumn}, unit_id, approved_by, justification)
             VALUES ($1,$2,$3,$4,$5)`,
            [organizationId, id, unitId, authenticated.id, justification],
          )
          await client.query(
            `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
             VALUES ($1,$2,'release_approved',$3,$4,$5::jsonb)`,
            [organizationId, authenticated.id, entityType, String(id), JSON.stringify({ justification, unitId })],
          )
        }, accessContext)
        return json(response, 201, { entityType, id, approvedBy: authenticated.id })
      }
      const homologateMatch = pathname.match(/^\/api\/rules\/(\d+)\/homologate$/)
      if (pathname === '/api/rules' && request.method === 'POST') {
        if (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'rules', 'can_write')) return forbidden(response)
        const indicatorId = Number(body.indicatorId)
        const name = typeof body.name === 'string' ? body.name.trim() : ''
        const version = typeof body.version === 'string' ? body.version.trim() : ''
        const parseBoundary = (value) => value === null || value === undefined || value === '' ||
          (typeof value === 'string' && value.trim() === '')
          ? null
          : typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
        const minimumValue = parseBoundary(body.minimumValue)
        const maximumValue = parseBoundary(body.maximumValue)
        if (!Number.isSafeInteger(indicatorId) || indicatorId < 1 || name.length < 1 || name.length > 160 || hasControlCharacter(name) ||
          version.length < 1 || version.length > 40 || hasControlCharacter(version) ||
          (minimumValue === null && maximumValue === null) ||
          (minimumValue !== null && !Number.isFinite(minimumValue)) ||
          (maximumValue !== null && !Number.isFinite(maximumValue)) ||
          (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue)) {
          return error(response, 400, 'informe indicador, nome, versão e limites numéricos homologáveis válidos.')
        }
        const indicator = await db.query(
          'SELECT id FROM indicator_definitions WHERE id=$1 AND organization_id=$2',
          [indicatorId, organizationId], organizationId,
        )
        if (!indicator.rowCount) return error(response, 404, 'indicador não encontrado.')
        const expressions = []
        if (minimumValue !== null) expressions.push(`value >= ${minimumValue}`)
        if (maximumValue !== null) expressions.push(`value <= ${maximumValue}`)
        const expression = expressions.join(' AND ')
        const rule = await db.query(
          `INSERT INTO technical_rules
             (organization_id, indicator_id, name, rule_expression, version, minimum_value, maximum_value)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, name, version, minimum_value, maximum_value, homologation_status`,
          [organizationId, indicatorId, name, expression, version, minimumValue, maximumValue],
          organizationId,
        )
        await db.query(
          `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
           VALUES ($1,$2,'rule_drafted','technical_rule',$3,$4::jsonb)`,
          [organizationId, authenticated.id, String(rule.rows[0].id), JSON.stringify({
            indicatorId, name, version, minimumValue, maximumValue,
          })],
          organizationId,
        )
        return json(response, 201, {
          id: Number(rule.rows[0].id),
          name: rule.rows[0].name,
          version: rule.rows[0].version,
          minimumValue: rule.rows[0].minimum_value,
          maximumValue: rule.rows[0].maximum_value,
          status: rule.rows[0].homologation_status,
        })
      }
      if (homologateMatch && request.method === 'POST') {
        if (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'rules', 'can_homologate_rules')) return forbidden(response)
        const id = Number(homologateMatch[1])
        const justification = typeof body.justification === 'string' ? body.justification.trim() : ''
        if (!Number.isSafeInteger(id) || justification.length < 10 || justification.length > 2000) {
          return error(response, 400, 'identificador ou justificativa inválida.')
        }
        const update = await db.query(
          `UPDATE technical_rules SET homologation_status='homologated', homologated_by=$1, homologated_at=now()
           WHERE id=$2 AND organization_id=$3 AND homologation_status='draft' RETURNING id`,
          [authenticated.id, id, organizationId], organizationId,
        )
        if (!update.rowCount) {
          const exists = await db.query('SELECT id FROM technical_rules WHERE id=$1 AND organization_id=$2', [id, organizationId], organizationId)
          return exists.rowCount ? error(response, 409, 'a regra já foi processada.') : error(response, 404, 'regra não encontrada.')
        }
        await db.query(
          `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
           VALUES ($1,$2,'rule_homologated','technical_rule',$3,$4::jsonb)`,
          [organizationId, authenticated.id, String(id), JSON.stringify({ justification })], organizationId,
        )
        return json(response, 200, { id, status: 'homologated' })
      }
      const closeMatch = pathname.match(/^\/api\/periods\/(\d+)\/close$/)
      if (closeMatch && request.method === 'POST') {
        if (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'periods', 'can_write')) return forbidden(response)
        const harvestId = Number(closeMatch[1])
        if (!Number.isSafeInteger(harvestId)) return error(response, 400, 'identificador de safra inválido.')
        const closed = await db.transaction(async (client) => {
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${organizationId}:harvest:${harvestId}`])
          const harvest = await client.query(
            `SELECT id, unit_id, name, starts_on, ends_on FROM harvests
             WHERE organization_id=$1 AND id=$2`,
            [organizationId, harvestId],
          )
          if (!harvest.rowCount) return null
          const unitId = harvest.rows[0].unit_id
          if (!hasUnitScope(accessContext, unitId)) return null
          const counts = await client.query(
            `SELECT
               (SELECT count(*) FROM measurements WHERE organization_id=$1 AND harvest_id=$2) AS measurements,
               (SELECT count(*) FROM loads WHERE organization_id=$1 AND harvest_id=$2) AS loads`,
            [organizationId, harvestId],
          )
          const previous = await client.query(
            'SELECT COALESCE(max(version),0)::integer AS version FROM closure_versions WHERE organization_id=$1 AND harvest_id=$2',
            [organizationId, harvestId],
          )
          const snapshot = {
            harvest: harvest.rows[0],
            totals: { measurements: Number(counts.rows[0].measurements), loads: Number(counts.rows[0].loads) },
            closedAt: nowIso(),
          }
          const result = await client.query(
            `INSERT INTO closure_versions (organization_id, harvest_id, unit_id, version, status, released_by, released_at, snapshot)
             VALUES ($1,$2,$3,$4,'released',$5,now(),$6::jsonb) RETURNING id, version, released_at`,
            [organizationId, harvestId, unitId, Number(previous.rows[0].version) + 1, authenticated.id, JSON.stringify(snapshot)],
          )
          await client.query(
            `INSERT INTO audit_events (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
             VALUES ($1,$2,'period_closed','harvest',$3,$4::jsonb)`,
            [organizationId, authenticated.id, String(harvestId), JSON.stringify({ version: result.rows[0].version, unitId })],
          )
          return result.rows[0]
        }, accessContext)
        if (!closed) return error(response, 404, 'safra não encontrada.')
        return json(response, 201, { id: Number(closed.id), harvestId, version: closed.version, releasedAt: closed.released_at })
      }
      const exportMatch = pathname.match(/^\/api\/exports\/([a-z]+)$/)
      if (exportMatch && request.method === 'GET') {
        const kind = exportMatch[1] === 'indicador' ? 'indicador' : exportMatch[1]
        const module = permissionModules[kind]
        if (!module || !kinds.has(kind) && kind !== 'indicador') return error(response, 404, 'rota não encontrada.')
        if (!hasPermission(accessContext, module, 'can_read') || !hasPermission(accessContext, module, 'can_export')) return forbidden(response)
        const records = await listRecords(db, kind, organizationId)
        return json(response, 200, records.map(recordView))
      }
      const originalMatch = pathname.match(/^\/api\/imports\/(\d+)\/original$/)
      if (originalMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read') || !hasPermission(accessContext, 'imports', 'can_export')) return forbidden(response)
        const id = Number(originalMatch[1])
        if (!Number.isSafeInteger(id)) return error(response, 400, 'identificador de importação inválido.')
        const batch = await db.query(
          'SELECT object_key, original_filename FROM import_batches WHERE id=$1 AND organization_id=$2',
          [id, organizationId], organizationId,
        )
        if (!batch.rowCount) return error(response, 404, 'arquivo original não encontrado.')
        const original = await retrieveOriginalFn({ organizationId, objectKey: batch.rows[0].object_key })
        const safeFilename = batch.rows[0].original_filename.replace(/[^\x20-\x7e"\\;]/g, '_')
        response.writeHead(200, {
          'Content-Type': original.contentType,
          'Content-Length': original.bytes.length,
          'Content-Disposition': `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(batch.rows[0].original_filename)}`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(original.bytes)
        return true
      }
      if (pathname === '/api/imports/options' && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read')) return forbidden(response)
        const [units, harvests, sources] = await Promise.all([
          db.query('SELECT id, name FROM units WHERE organization_id=$1 ORDER BY name', [organizationId], organizationId),
          db.query('SELECT id, name, unit_id FROM harvests WHERE organization_id=$1 ORDER BY starts_on DESC, name', [organizationId], organizationId),
          db.query('SELECT id, name FROM sources WHERE organization_id=$1 AND source_type=\'file\' ORDER BY name', [organizationId], organizationId),
        ])
        return json(response, 200, {
          units: units.rows.map((row) => ({ id: Number(row.id), name: row.name })),
          harvests: harvests.rows.map((row) => ({ id: Number(row.id), name: row.name, unitId: row.unit_id === null ? null : Number(row.unit_id) })),
          sources: sources.rows.map((row) => ({ id: Number(row.id), name: row.name })),
        })
      }
      if (pathname === '/api/imports/quality' && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read') || !hasPermission(accessContext, 'analytics', 'can_read')) return forbidden(response)
        const batches = await db.query(
          `SELECT b.id, b.original_filename, b.status, b.received_at, b.processed_at,
                  f.received_count, f.accepted_count, f.rejected_count, f.suspect_count,
                  f.pending_count, f.quality_metrics
           FROM analytics.fact_imports_quality f
           JOIN raw.import_batches b
             ON b.organization_id=f.organization_id AND b.id=f.import_batch_id
           WHERE f.organization_id=$1
           ORDER BY b.received_at DESC
           LIMIT 30`,
          [organizationId], organizationId,
        )
        return json(response, 200, batches.rows.map((row) => ({
          ...row,
          id: Number(row.id),
          receivedCount: Number(row.received_count),
          acceptedCount: Number(row.accepted_count),
          rejectedCount: Number(row.rejected_count),
          suspectCount: Number(row.suspect_count),
          pendingCount: Number(row.pending_count),
        })))
      }
      const reportMatch = pathname.match(/^\/api\/imports\/(\d+)\/report\.csv$/)
      if (reportMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read') || !hasPermission(accessContext, 'imports', 'can_export')) return forbidden(response)
        const batchId = Number(reportMatch[1])
        const batch = await db.query(
          'SELECT id, original_filename FROM import_batches WHERE id=$1 AND organization_id=$2',
          [batchId, organizationId], organizationId,
        )
        if (!batch.rowCount) return error(response, 404, 'lote de importação não encontrado.')
        const rows = await db.query(
          `SELECT source_row_number, row_queue, raw_payload, validation_issues
           FROM raw_import_rows
           WHERE organization_id=$1 AND import_batch_id=$2
             AND row_queue IN ('Rejeitados', 'Suspeitos')
           ORDER BY source_row_number`,
          [organizationId, batchId], organizationId,
        )
        const output = [['linha', 'fila', 'categoria', 'codigo', 'motivo_tecnico', 'dados_originais']
          .map(csvCell).join(',')]
        for (const row of rows.rows) {
          const issues = Array.isArray(row.validation_issues) ? row.validation_issues : []
          for (const issue of issues) {
            output.push([
              row.source_row_number,
              row.row_queue,
              issue.category,
              issue.code,
              issue.message,
              JSON.stringify(row.raw_payload),
            ].map(csvCell).join(','))
          }
        }
        const filename = `importacao-${batchId}-erros.csv`
        response.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(`\uFEFF${output.join('\r\n')}`)
        return true
      }
      const rowsMatch = pathname.match(/^\/api\/imports\/(\d+)\/rows$/)
      if (rowsMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read')) return forbidden(response)
        const batchId = Number(rowsMatch[1])
        const queue = url.searchParams.get('queue')
        const allowedQueues = new Set(['Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes'])
        if (!allowedQueues.has(queue)) return error(response, 400, 'informe uma fila de importação válida.')
        const limit = Number(url.searchParams.get('limit') || 50)
        const offset = Number(url.searchParams.get('offset') || 0)
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
          return error(response, 400, 'paginação inválida.')
        }
        const batch = await db.query(
          'SELECT id FROM import_batches WHERE id=$1 AND organization_id=$2',
          [batchId, organizationId], organizationId,
        )
        if (!batch.rowCount) return error(response, 404, 'lote de importação não encontrado.')
        const result = await db.query(
          `SELECT source_row_number, row_queue, raw_payload, validation_issues, normalized_payload
           FROM raw_import_rows
           WHERE organization_id=$1 AND import_batch_id=$2 AND row_queue=$3
           ORDER BY source_row_number
           LIMIT $4 OFFSET $5`,
          [organizationId, batchId, queue, limit, offset], organizationId,
        )
        return json(response, 200, {
          rows: result.rows.map((row) => ({
            sourceRowNumber: Number(row.source_row_number),
            queue: row.row_queue,
            raw: row.raw_payload,
            issues: row.validation_issues,
            normalized: row.normalized_payload,
          })),
          limit,
          offset,
        })
      }
      const previewMatch = pathname.match(/^\/api\/imports\/(\d+)\/preview$/)
      if (previewMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'imports', 'can_read')) return forbidden(response)
        const batchId = Number(previewMatch[1])
        const batch = await db.query(
          `SELECT id, source_id, object_key, original_filename, selected_sheet, mapping_json, entity_type, status
           FROM import_batches WHERE id=$1 AND organization_id=$2`,
          [batchId, organizationId], organizationId,
        )
        if (!batch.rowCount) return error(response, 404, 'lote de importação não encontrado.')
        if (!['uploaded', 'previewed'].includes(batch.rows[0].status)) return error(response, 409, 'este lote não pode gerar uma nova prévia.')
        const requestedSheet = typeof body.sheetName === 'string' ? body.sheetName : batch.rows[0].selected_sheet || ''
        const original = await retrieveOriginalFn({ organizationId, objectKey: batch.rows[0].object_key })
        const document = await parseImportFile(original.bytes, batch.rows[0].original_filename, requestedSheet)
        const mapping = batch.rows[0].mapping_json || suggestColumnMapping(document.headers, batch.rows[0].entity_type)
        await db.query(
          `UPDATE import_batches
           SET status='previewed', selected_sheet=$3, previewed_at=now()
           WHERE id=$1 AND organization_id=$2`,
          [batchId, organizationId, document.selectedSheet || null], organizationId,
        )
        const templates = await db.query(
          `SELECT id, name, sheet_name, mapping_json
           FROM import_mapping_templates
           WHERE organization_id=$1 AND source_id=$2 AND entity_type=$3
           ORDER BY name`,
          [organizationId, batch.rows[0].source_id, batch.rows[0].entity_type], organizationId,
        )
        return json(response, 200, {
          id: batchId,
          sheets: document.sheetNames,
          selectedSheet: document.selectedSheet,
          headers: document.headers,
          suggestedMapping: mapping,
          templates: templates.rows.map((template) => ({
            id: Number(template.id), name: template.name, sheetName: template.sheet_name, mapping: template.mapping_json,
          })),
          totalRows: document.rows.length,
          rows: document.rows.slice(0, 25).map((row) => ({ rowNumber: row.rowNumber, values: row.raw })),
        })
      }
      const confirmMatch = pathname.match(/^\/api\/imports\/(\d+)\/confirm$/)
      if (confirmMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'imports', 'can_write')) return forbidden(response)
        const batchId = Number(confirmMatch[1])
        const batchResult = await db.query(
          `SELECT id, source_id, object_key, original_filename, selected_sheet, entity_type, status
           FROM import_batches WHERE id=$1 AND organization_id=$2`,
          [batchId, organizationId], organizationId,
        )
        const batch = batchResult.rows[0]
        if (!batch) return error(response, 404, 'lote de importação não encontrado.')
        if (batch.status !== 'previewed') return error(response, 409, 'a prévia obrigatória precisa ser concluída antes da confirmação.')
        const mapping = body.mapping
        const original = await retrieveOriginalFn({ organizationId, objectKey: batch.object_key })
        const document = await parseImportFile(original.bytes, batch.original_filename, batch.selected_sheet || '')
        const mappingError = validateColumnMapping(mapping, document.headers, batch.entity_type)
        if (mappingError) return error(response, 400, mappingError)
        const templateName = typeof body.templateName === 'string' ? body.templateName.trim() : ''
        if (templateName.length > 120 || hasControlCharacter(templateName)) return error(response, 400, 'nome de template inválido.')
        const saved = await db.transaction(async (client) => {
          let templateId = null
          if (templateName) {
            const template = await client.query(
              `INSERT INTO import_mapping_templates
                 (organization_id, source_id, created_by, name, sheet_name, entity_type, mapping_json)
               VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
               ON CONFLICT (organization_id, source_id, entity_type, name)
               DO UPDATE SET created_by=EXCLUDED.created_by, sheet_name=EXCLUDED.sheet_name,
                 mapping_json=EXCLUDED.mapping_json, updated_at=now()
               RETURNING id`,
              [organizationId, batch.source_id, authenticated.id, templateName, batch.selected_sheet,
                batch.entity_type, JSON.stringify(mapping)],
            )
            templateId = template.rows[0].id
          }
          const updated = await client.query(
            `UPDATE import_batches
             SET status='queued', mapping_json=$3::jsonb, mapping_template_id=$4,
                 confirmed_at=now(), confirmed_by=$5
             WHERE id=$1 AND organization_id=$2 AND status='previewed'
             RETURNING id`,
            [batchId, organizationId, JSON.stringify(mapping), templateId, authenticated.id],
          )
          if (!updated.rowCount) return false
          await client.query(
            `INSERT INTO import_jobs (organization_id, import_batch_id)
             VALUES ($1,$2)`,
            [organizationId, batchId],
          )
          await client.query(
            `INSERT INTO audit_events
               (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
             VALUES ($1,$2,'import_confirmed','import_batch',$3,$4::jsonb)`,
            [organizationId, authenticated.id, String(batchId), JSON.stringify({ status: 'queued', mappingTemplateId: templateId })],
          )
          return true
        }, accessContext)
        if (!saved) return error(response, 409, 'o lote já foi confirmado ou está sendo processado.')
        return json(response, 202, { id: batchId, status: 'queued', message: 'lote confirmado e enviado para processamento assíncrono.' })
      }
      const importStatusMatch = pathname.match(/^\/api\/imports\/(\d+)$/)
      if (importStatusMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'imports', 'can_read')) return forbidden(response)
        const batchId = Number(importStatusMatch[1])
        const batch = await db.query(
          `SELECT id, original_filename, content_sha256, version, reprocess_of, selected_sheet, entity_type,
                  status, received_at, previewed_at, confirmed_at, processing_started_at,
                  processed_at, failure_message, quality_metrics
           FROM import_batches WHERE id=$1 AND organization_id=$2`,
          [batchId, organizationId], organizationId,
        )
        if (!batch.rowCount) return error(response, 404, 'lote de importação não encontrado.')
        const queueCounts = await db.query(
          `SELECT row_queue, count(*)::integer AS count
           FROM raw_import_rows WHERE organization_id=$1 AND import_batch_id=$2
           GROUP BY row_queue`,
          [organizationId, batchId], organizationId,
        )
        return json(response, 200, {
          ...batch.rows[0],
          id: Number(batch.rows[0].id),
          version: batch.rows[0].version === null ? null : Number(batch.rows[0].version),
          queues: Object.fromEntries(queueCounts.rows.map((row) => [row.row_queue, row.count])),
        })
      }
      if (pathname === '/api/imports' && request.method === 'POST') {
        if (!hasPermission(accessContext, 'imports', 'can_write')) return forbidden(response)
        const fileName = typeof body.fileName === 'string' ? body.fileName : ''
        const contentType = typeof body.contentType === 'string' ? body.contentType : ''
        const base64 = typeof body.base64 === 'string' ? body.base64 : ''
        const allowedTypes = new Map([
          ['text/csv', '.csv'],
          ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
        ])
        const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase()
        if (fileName.length < 5 || fileName.length > 255 || hasControlCharacter(fileName) ||
          allowedTypes.get(contentType) !== extension || !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(base64) || !base64) {
          return error(response, 400, 'envie um arquivo CSV ou XLSX válido.')
        }
        const bytes = Buffer.from(base64, 'base64')
        if (bytes.length > 9 * 1024 * 1024) return error(response, 413, 'o arquivo ultrapassa o limite permitido.')
        const unitId = Number(body.unitId)
        const harvestId = Number(body.harvestId)
        const entityType = typeof body.entityType === 'string' ? body.entityType : 'measurements'
        const frontId = body.frontId === undefined || body.frontId === null || body.frontId === '' ? null : Number(body.frontId)
        const sourceName = typeof body.sourceName === 'string' ? body.sourceName.trim() : 'portal-file-upload'
        if (!Number.isSafeInteger(unitId) || unitId < 1 || !Number.isSafeInteger(harvestId) || harvestId < 1 ||
          !['measurements', 'loads', 'quality_analyses'].includes(entityType) ||
          sourceName.length < 1 || sourceName.length > 120 || hasControlCharacter(sourceName)) {
          return error(response, 400, 'selecione uma usina, uma safra e uma fonte válidas.')
        }
        if (!hasUnitScope(accessContext, unitId)) return forbidden(response)
        if (frontId !== null && (!Number.isSafeInteger(frontId) || !hasFrontScope(accessContext, frontId))) return forbidden(response)
        const harvest = await db.query(
          'SELECT id FROM harvests WHERE id=$1 AND organization_id=$2 AND unit_id=$3',
          [harvestId, organizationId, unitId], organizationId,
        )
        if (!harvest.rowCount) return error(response, 404, 'safra não encontrada para a usina selecionada.')
        if (frontId !== null) {
          const front = await db.query('SELECT id FROM fronts WHERE id=$1 AND organization_id=$2 AND unit_id=$3', [frontId, organizationId, unitId], organizationId)
          if (!front.rowCount) return error(response, 404, 'frente não encontrada.')
        }
        const fileHash = digest(bytes)
        const requestedReprocess = body.reprocessOf === undefined || body.reprocessOf === null || body.reprocessOf === ''
          ? null
          : Number(body.reprocessOf)
        if (requestedReprocess !== null && (!Number.isSafeInteger(requestedReprocess) || requestedReprocess < 1)) {
          return error(response, 400, 'referência de reprocessamento inválida.')
        }
        const result = await db.transaction(async (client) => {
          await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`${organizationId}:${unitId}:${entityType}:${fileHash}`],
          )
          const duplicate = await client.query(
            `SELECT id, status, version, original_filename
             FROM import_batches
             WHERE organization_id=$1 AND unit_id=$2 AND entity_type=$3 AND content_sha256=$4
             ORDER BY received_at DESC LIMIT 1`,
            [organizationId, unitId, entityType, fileHash],
          )
          let previous = null
          let version = 1
          if (requestedReprocess === null && duplicate.rowCount) {
            return { duplicate: duplicate.rows[0] }
          }
          if (requestedReprocess !== null) {
            const prior = await client.query(
              `SELECT id, object_key, original_filename
               FROM import_batches
               WHERE id=$1 AND organization_id=$2 AND unit_id=$3 AND entity_type=$4 AND content_sha256=$5`,
              [requestedReprocess, organizationId, unitId, entityType, fileHash],
            )
            if (!prior.rowCount) return { invalidReprocess: true }
            previous = prior.rows[0]
            const latestVersion = await client.query(
              `SELECT COALESCE(max(version),0)::integer AS version
               FROM import_batches
               WHERE organization_id=$1 AND unit_id=$2 AND entity_type=$3 AND content_sha256=$4`,
              [organizationId, unitId, entityType, fileHash],
            )
            version = Number(latestVersion.rows[0].version) + 1
          }
          const original = previous
            ? { key: previous.object_key, sha256: fileHash }
            : await preserveOriginalFn({ organizationId, fileName, contentType, bytes })
          const source = await client.query(
            `INSERT INTO sources (organization_id, name, source_type, authorized_read_only)
             VALUES ($1,$2,'file',true)
             ON CONFLICT (organization_id, name) DO UPDATE SET source_type='file'
             RETURNING id`,
            [organizationId, sourceName],
          )
          const created = await client.query(
            `INSERT INTO import_batches
               (organization_id, source_id, uploaded_by, unit_id, front_id, harvest_id, entity_type,
                object_key, original_filename, content_sha256, status, version, reprocess_of)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'uploaded',$11,$12)
             RETURNING id, received_at, status, version`,
            [organizationId, source.rows[0].id, authenticated.id, unitId, frontId, harvestId,
              entityType, original.key, fileName, fileHash, version, previous?.id || null],
          )
          await client.query(
            `INSERT INTO audit_events
               (organization_id, actor_user_id, event_type, entity_type, entity_id, after_data)
             VALUES ($1,$2,'import_batch_created','import_batch',$3,$4::jsonb)`,
            [organizationId, authenticated.id, String(created.rows[0].id), JSON.stringify({
               unitId, harvestId, entityType, sourceId: Number(source.rows[0].id), sha256: fileHash,
              version, reprocessOf: previous?.id || null,
            })],
          )
          return { batch: created.rows[0] }
        }, accessContext)
        if (result.duplicate) {
          return json(response, 409, {
            message: 'este arquivo já foi importado para este tipo de dado nesta usina.',
            existingBatchId: Number(result.duplicate.id),
            version: result.duplicate.version === null ? null : Number(result.duplicate.version),
            status: result.duplicate.status,
            canReprocess: true,
          })
        }
        if (result.invalidReprocess) return error(response, 404, 'lote-base não encontrado para reprocessamento.')
        return json(response, 201, {
          id: Number(result.batch.id),
          fileName,
          sha256: fileHash,
          receivedAt: result.batch.received_at,
          status: result.batch.status,
          version: Number(result.batch.version),
        })
      }

      const indicatorMatch = pathname.match(/^\/api\/indicador(?:\/(\d+))?$/)
      const recordMatch = pathname.match(/^\/api\/cadastros\/([a-z]+)(?:\/(\d+))?$/)
      const kind = indicatorMatch ? 'indicador' : recordMatch && kinds.has(recordMatch[1]) ? recordMatch[1] : null
      const recordId = indicatorMatch?.[1] || recordMatch?.[2]
      if (!kind) return error(response, 404, 'rota não encontrada.')
      const module = permissionModules[kind]
      const action = ['GET', 'HEAD'].includes(request.method) ? 'can_read' : 'can_write'
      if (!hasPermission(accessContext, module, action)) return forbidden(response)
      if (['GET', 'HEAD'].includes(request.method)) {
        if (recordId) {
          const row = await getRecord(db, kind, Number(recordId), organizationId)
          if (!row) return error(response, 404, 'registro não encontrado.')
          return json(response, 200, recordView(row))
        }
        return json(response, 200, (await listRecords(db, kind, organizationId)).map(recordView))
      }
      if (!['POST', 'PUT', 'DELETE'].includes(request.method)) return error(response, 405, 'método não permitido.')
      if (kind === 'indicador' && request.method !== 'DELETE') {
        const { Nome, Descricao, Url } = body
        if (typeof Nome !== 'string' || !Nome.trim() || Nome.trim().length > 160 || typeof Descricao !== 'string' || !Descricao.trim() || Descricao.trim().length > 2000 || !validPowerBiUrl(Url, trustedPowerBiHosts)) return error(response, 400, 'informe nome, descrição e URL reportEmbed válida do Power BI com reportId e ctid.')
      } else if (request.method !== 'DELETE') {
        const payload = body
        if (!Object.keys(payload).length || JSON.stringify(payload).length > 10 * 1024 * 1024) return error(response, 400, 'informe os campos do registro.')
        const required = {
          safra: ['nomeSafra', 'dataInicio', 'dataFim', 'foto'],
          unidade: ['nome'],
          frente: ['nome', 'unidade'],
          equipamento: ['nome', 'unidade'],
          medicao: ['safra', 'equipamento', 'tipoInformacao', 'valor', 'data'],
          unidademedida: ['nome', 'simbolo'],
          tipoinformacao: ['nome', 'unidadeMedida'],
        }[kind]
        if (required.some((field) => payload[field] === undefined || payload[field] === '')) return error(response, 400, 'preencha todos os campos obrigatórios.')
        if (kind === 'safra' && (payload.unitId === undefined || payload.unitId === '')) {
          if (accessContext.allowedUnitIds.length === 1 && accessContext.allowedUnitIds[0] !== '*') {
            payload.unitId = Number(accessContext.allowedUnitIds[0])
          } else if (accessContext.accessLevel !== 'strategic') {
            return forbidden(response)
          }
        }
        if (kind === 'safra' && payload.unitId != null && !Number.isSafeInteger(Number(payload.unitId))) return error(response, 400, 'identificador de usina inválido.')
        if (kind === 'safra' && payload.unitId != null && !hasUnitScope(accessContext, payload.unitId)) return forbidden(response)
        if (kind === 'safra' && payload.unitId != null) {
          const unit = await getRecord(db, 'unidade', Number(payload.unitId), organizationId)
          if (!unit) return error(response, 400, 'a usina não pertence à sua organização.')
          payload.unitId = Number(payload.unitId)
        }
        if (kind === 'safra' && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dataInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dataFim) || payload.dataFim < payload.dataInicio)) return error(response, 400, 'informe um intervalo de datas válido para a safra.')
        if (kind === 'medicao' && (!Number.isFinite(Number(payload.valor)) || !Number.isFinite(Date.parse(payload.data)))) return error(response, 400, 'informe um valor numérico e uma data válidos para a medição.')
        for (const [field, relationKind] of Object.entries(relations[kind] || {})) {
          if (payload[field] === undefined || payload[field] === '') continue
          if (!Number.isSafeInteger(Number(payload[field]))) return error(response, 400, `a referência de ${field} não é válida.`)
          const relation = await getRecord(db, relationKind, Number(payload[field]), organizationId)
          if (!relation) return error(response, 400, `a referência de ${field} não pertence à sua organização.`)
        }
        if (['frente', 'equipamento'].includes(kind) && !hasUnitScope(accessContext, payload.unidade)) return forbidden(response)
        if (kind === 'equipamento' && payload.frente) {
          if (!hasFrontScope(accessContext, payload.frente)) return forbidden(response)
          const front = await db.query(
            'SELECT id FROM fronts WHERE id=$1 AND organization_id=$2 AND unit_id=$3',
            [payload.frente, organizationId, payload.unidade], organizationId,
          )
          if (!front.rowCount) return error(response, 400, 'a frente não pertence à usina selecionada.')
        }
        if (kind === 'medicao') {
          const equipment = await db.query(
            'SELECT unit_id, front_id FROM equipment WHERE id=$1 AND organization_id=$2',
            [payload.equipamento, organizationId], organizationId,
          )
          if (!equipment.rowCount) return error(response, 400, 'o equipamento não pertence à sua organização.')
          if (!hasUnitScope(accessContext, equipment.rows[0].unit_id) ||
            (equipment.rows[0].front_id !== null && !hasFrontScope(accessContext, equipment.rows[0].front_id))) return forbidden(response)
        }
        if (Object.hasOwn(payload, 'foto') && !imageIsValid(payload.foto)) return error(response, 400, 'a imagem deve ser PNG, JPEG ou WebP e ter até 8 MB.')
        for (const field of Object.keys(relations[kind] || {})) if (payload[field] !== undefined) payload[field] = Number(payload[field])
      }
      const stamp = nowIso()
      let payload = payloadFor(kind, body)
      if (request.method === 'POST') {
        if (kind === 'safra' && payload.foto) payload._photoObjectKey = (await archiveImage(organizationId, payload.foto)).key
        if (kind === 'medicao') {
          const indicator = await db.query('SELECT u.symbol FROM indicator_definitions i LEFT JOIN unit_of_measure u ON u.id=i.unit_of_measure_id AND u.organization_id=i.organization_id WHERE i.id=$1 AND i.organization_id=$2',
            [payload.tipoInformacao, organizationId], organizationId)
          payload._unitSymbol = indicator.rows[0]?.symbol || ''
        }
        const id = await insertRecord(db, kind, payload, authenticated, organizationId, stamp)
        return json(response, 201, recordView({ id, payload: publicPayload(payload) }))
      }
      const current = await getRecord(db, kind, Number(recordId), organizationId)
      if (!current) return error(response, 404, 'registro não encontrado.')
      if (kind === 'medicao') return error(response, 409, 'medições são imutáveis; registre uma nova medição para corrigir o dado.')
      if (request.method === 'DELETE') {
        if (kind === 'indicador') {
          await db.transaction(async (client) => {
            const users = await client.query('SELECT id, favorites_json FROM users WHERE organization_id=$1', [organizationId])
            for (const user of users.rows) {
              const favorites = (Array.isArray(user.favorites_json) ? user.favorites_json : []).filter((id) => String(id) !== String(recordId))
              await client.query('UPDATE users SET favorites_json=$1::jsonb WHERE id=$2 AND organization_id=$3', [JSON.stringify(favorites), user.id, organizationId])
            }
            await client.query('DELETE FROM dashboard_reports WHERE id=$1 AND organization_id=$2', [Number(recordId), organizationId])
          }, organizationId)
        } else {
          await db.query(`DELETE FROM ${recordTables[kind]} WHERE id=$1 AND organization_id=$2`, [Number(recordId), organizationId], organizationId)
        }
        return json(response, 204, null)
      }
      if (kind === 'safra' && payload.foto) payload._photoObjectKey = (await archiveImage(organizationId, payload.foto)).key
      await updateRecord(db, kind, Number(recordId), payload, organizationId, stamp)
      return json(response, 200, recordView({ id: Number(recordId), payload: publicPayload(payload) }))
    } catch (cause) {
      if (cause.status) return error(response, cause.status, cause.message)
      if (cause.code === '42501') return forbidden(response)
      if (cause.code === '23503') return error(response, 409, 'este registro ainda está associado a outros dados ou contém uma referência inválida.')
      if (cause.code === '23505') return error(response, 409, 'já existe um registro com esses dados nesta organização.')
      process.stderr.write(`[api] ${request.method} ${pathname}: ${cause.message}\n`)
      return error(response, 500, 'erro interno do serviço.')
    } finally {
      if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
        process.stdout.write(`[${new Date().toISOString()}] ${request.method} ${pathname} - ${Date.now() - startMs}ms\n`)
      }
    }
    })
  }
}

export function startSessionCleanup(db) {
  const timer = setInterval(() => {
    db.query('DELETE FROM sessions WHERE expires_at <= $1', [Date.now()])
      .catch((cause) => process.stderr.write(`[sessions] cleanup failed: ${cause.message}\n`))
  }, 60 * 60 * 1000)
  timer.unref()
  return timer
}

function cryptoRandomId() { return randomBytes(16).toString('hex') }
