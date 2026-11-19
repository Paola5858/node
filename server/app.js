import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { preserveOriginal, retrieveOriginal } from './objectStorage.js'
import { withSecurityContext } from './database.js'
import { parseImportFile, suggestColumnMapping, validateColumnMapping } from './importPipeline.js'
import {
  calculateAtrTonnes,
  calculateTch,
  calculateWeightedAverage,
  catalogRows,
  isCompatibleMetricUnit,
  normalizeTonnes,
} from './metricEngine.js'
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
import {
  isValidOccurrenceTransition,
  occurrenceWorkflow,
  parseOccurrenceEvidence,
  recordStateValues,
} from './operationalWorkflow.js'

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
function numericInput(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
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
function operationalStateView(row, inferredOriginStatus = null) {
  return {
    operationalCondition: row?.operational_condition || 'unknown',
    dataCondition: row?.data_condition || 'pendente',
    attentionPriority: row?.attention_priority || 'none',
    investigationStatus: row?.investigation_status || 'not_started',
    releaseStatus: row?.release_status || 'pending',
    originStatus: row?.origin_status || inferredOriginStatus ||
      (row?.supplier_id || row?.farm_id || row?.plot_id || row?.front_id ? 'informada' : 'não_confirmada'),
    updatedBy: row?.updated_by || null,
    updatedAt: row?.updated_at || null,
  }
}
async function appendAuditLog(client, {
  organizationId, unitId, actorUserId, requestId, eventType, entityType, entityId,
  justification = null, beforeData = null, afterData = null,
}) {
  await client.query(
    `INSERT INTO audit_logs
       (organization_id, unit_id, actor_user_id, request_id, event_type, entity_type,
        entity_id, justification, before_data, after_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb)`,
    [
      organizationId, unitId, actorUserId, requestId || null, eventType, entityType,
      String(entityId), justification,
      beforeData === null ? null : JSON.stringify(beforeData),
      afterData === null ? null : JSON.stringify(afterData),
    ],
  )
}
async function insertOccurrenceEvidence(client, {
  organizationId, unitId, occurrenceId, actorUserId, evidence, periodStart, periodEnd,
}) {
  const rows = []
  for (const item of evidence) {
    let metricCode = null
    let loadId = null
    let sampleId = null
    if (item.type === 'kpi') {
      metricCode = item.metricCode
      const metric = await client.query(
        `SELECT 1 FROM metric_definitions
         WHERE organization_id=$1 AND code=$2 AND status='homologated'
           AND valid_from <= $3::date AND (valid_to IS NULL OR valid_to >= $4::date)
         LIMIT 1`,
        [organizationId, metricCode, periodStart, periodEnd],
      )
      if (!metric.rowCount) return { error: 'unknown_metric_evidence' }
    } else if (item.type === 'load') {
      loadId = Number(item.loadId)
      const load = await client.query(
        'SELECT id FROM loads WHERE organization_id=$1 AND id=$2 AND unit_id=$3',
        [organizationId, loadId, unitId],
      )
      if (!load.rowCount) return { error: 'invalid_load_evidence' }
    } else {
      sampleId = Number(item.sampleId)
      const sample = await client.query(
        'SELECT id FROM samples WHERE organization_id=$1 AND id=$2 AND unit_id=$3',
        [organizationId, sampleId, unitId],
      )
      if (!sample.rowCount) return { error: 'invalid_sample_evidence' }
    }
    const details = item.details && typeof item.details === 'object' && !Array.isArray(item.details)
      ? item.details
      : {}
    if (JSON.stringify(details).length > 5000) return { error: 'invalid_evidence_details' }
    rows.push({ item, metricCode, loadId, sampleId, details })
  }
  for (const { item, metricCode, loadId, sampleId, details } of rows) {
    await client.query(
      `INSERT INTO occurrence_evidence
         (organization_id, occurrence_id, unit_id, evidence_type, metric_code, load_id, sample_id,
          period_start, period_end, details, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        organizationId, occurrenceId, unitId, item.type, metricCode, loadId, sampleId,
        periodStart, periodEnd, JSON.stringify(details), actorUserId,
      ],
    )
  }
  return { error: null }
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
      measured_at, received_at, processed_at, released_at, attributes, measurement_mode
    ) VALUES ($1,$2,$3,(SELECT unit_id FROM equipment WHERE organization_id=$1 AND id=$3),$4,$5,$6,$7,$8,NULL,'legacy-api-v1','api',$9,$10,$10,$10,$11::jsonb,'manual') RETURNING id`,
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
            const metricCatalog = catalogRows(user.id)
            await client.query(
              `INSERT INTO metric_definitions (
                 organization_id, code, name, category, unit, granularity, aggregation_rule,
                 required_fields, source_aliases, desirable_direction, technical_source, formula,
                 valid_from, rule_version, status, homologated_by, homologated_at
               )
               SELECT $1, item.code, item.name, item.category, item.unit, item.granularity,
                 item.aggregation, item.required_fields, item.aliases, item.direction,
                 item.technical_source, item.formula, item.valid_from, item.version,
                 'homologated', $3, now()
               FROM jsonb_to_recordset($2::jsonb) AS item(
                 code text, name text, category text, unit text, granularity text, aggregation text,
                 required_fields jsonb, aliases jsonb, direction text, technical_source text,
                 formula text, valid_from date, version text
               )
               ON CONFLICT (organization_id, code, rule_version) DO NOTHING`,
              [user.organization_id, JSON.stringify(metricCatalog.map((metric) => ({
                code: metric.code,
                name: metric.name,
                category: metric.category,
                unit: metric.unit,
                granularity: metric.granularity,
                aggregation: metric.aggregation,
                required_fields: metric.requiredFields,
                aliases: metric.aliases,
                direction: metric.direction,
                technical_source: metric.technicalSource,
                formula: metric.formula,
                valid_from: metric.validFrom,
                version: metric.version,
              }))), user.id],
            )
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
            permissionCodes: ['users:can_write', 'reports:can_write', 'analytics:can_read', 'analytics:can_write'],
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
      if (pathname === '/api/metrics/harvest-production' && request.method === 'POST') {
        if (!hasPermission(accessContext, 'harvests', 'can_write')) return forbidden(response)
        const harvestId = Number(body.harvestId)
        const plotId = Number(body.plotId)
        const harvestedTonnes = body.harvestedTonnes === '' || body.harvestedTonnes === null
          ? Number.NaN
          : Number(body.harvestedTonnes)
        const harvestedHectares = body.harvestedHectares === '' || body.harvestedHectares === null
          ? Number.NaN
          : Number(body.harvestedHectares)
        const harvestedAt = typeof body.harvestedAt === 'string' ? body.harvestedAt : ''
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(harvestedAt) &&
          !Number.isNaN(Date.parse(`${harvestedAt}T00:00:00Z`)) &&
          new Date(`${harvestedAt}T00:00:00Z`).toISOString().slice(0, 10) === harvestedAt
        if (!Number.isSafeInteger(harvestId) || harvestId < 1 ||
          !Number.isSafeInteger(plotId) || plotId < 1 ||
          !Number.isFinite(harvestedTonnes) || harvestedTonnes < 0 ||
          !Number.isFinite(harvestedHectares) || harvestedHectares <= 0 ||
          !validDate) {
          return error(response, 400, 'informe safra, talhão, toneladas colhidas, hectares colhidos e data válidos.')
        }
        const result = await db.transaction(async (client) => {
          const harvest = await client.query(
            `SELECT id, unit_id, starts_on, ends_on FROM harvests
             WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
            [organizationId, harvestId],
          )
          if (!harvest.rowCount) return { error: 'harvest_not_found' }
          const plot = await client.query(
            'SELECT id, unit_id FROM plots WHERE organization_id=$1 AND id=$2',
            [organizationId, plotId],
          )
          if (!plot.rowCount) return { error: 'plot_not_found' }
          const unitId = harvest.rows[0].unit_id
          if (unitId === null || String(plot.rows[0].unit_id) !== String(unitId)) return { error: 'incompatible_plot_harvest' }
          if (!hasUnitScope(accessContext, unitId)) return { error: 'forbidden' }
          if (harvestedAt < String(harvest.rows[0].starts_on).slice(0, 10) ||
            harvestedAt > String(harvest.rows[0].ends_on).slice(0, 10)) return { error: 'date_outside_harvest' }
          const versionResult = await client.query(
            `SELECT COALESCE(max(version),0)::integer AS version
             FROM harvest_production_records
             WHERE organization_id=$1 AND harvest_id=$2 AND plot_id=$3`,
            [organizationId, harvestId, plotId],
          )
          const version = Number(versionResult.rows[0].version) + 1
          const created = await client.query(
            `INSERT INTO harvest_production_records
               (organization_id, unit_id, harvest_id, plot_id, version, harvested_tonnes,
                harvested_hectares, harvested_at, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id, version, recorded_at`,
            [organizationId, unitId, harvestId, plotId, version, harvestedTonnes, harvestedHectares, harvestedAt, authenticated.id],
          )
          return {
            id: Number(created.rows[0].id),
            version: created.rows[0].version,
            recordedAt: created.rows[0].recorded_at,
            unitId: Number(unitId),
          }
        }, accessContext)
        if (result.error === 'forbidden') return forbidden(response)
        if (result.error === 'harvest_not_found') return error(response, 404, 'safra não encontrada.')
        if (result.error === 'plot_not_found') return error(response, 404, 'talhão não encontrado.')
        if (result.error === 'incompatible_plot_harvest') return error(response, 409, 'talhão e safra não pertencem à mesma usina.')
        if (result.error === 'date_outside_harvest') return error(response, 400, 'a data da colheita está fora da vigência da safra.')
        return json(response, 201, { ...result, harvestId, plotId, harvestedTonnes, harvestedHectares, harvestedAt })
      }
      if (pathname === '/api/operations/traceability' && request.method === 'GET') {
        if (!hasPermission(accessContext, 'analytics', 'can_read')) return forbidden(response)
        const unitValue = url.searchParams.get('unitId')
        const unitId = unitValue === null ? null : Number(unitValue)
        const periodStart = url.searchParams.get('start')
        const periodEnd = url.searchParams.get('end')
        const validDate = (value) => typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
        if ((unitId !== null && (!Number.isSafeInteger(unitId) || unitId < 1 || !hasUnitScope(accessContext, unitId))) ||
          ((periodStart || periodEnd) && (!validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd))) {
          return error(response, 400, 'informe unidade autorizada e período completo válido (start/end YYYY-MM-DD).')
        }
        const loadResult = await db.query(
          `SELECT l.id, l.unit_id, l.harvest_id, l.external_reference, l.supplier_id, supplier.name AS supplier_name,
             l.farm_id, farm.name AS farm_name,
             l.plot_id, l.front_id, l.source_id, l.gross_weight, l.tare_weight, l.net_weight,
             l.weight_unit, l.weighed_at, l.attributes, plot.name AS plot_name, front.name AS front_name,
             rs.operational_condition, rs.data_condition, rs.attention_priority,
             rs.investigation_status, rs.release_status, rs.origin_status, rs.updated_by, rs.updated_at,
             (SELECT count(*)::integer FROM samples s WHERE s.organization_id=l.organization_id AND s.load_id=l.id) AS sample_count,
             (SELECT count(*)::integer FROM load_weighings w WHERE w.organization_id=l.organization_id AND w.load_id=l.id) AS weighing_count,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', w.id, 'type', w.weighing_type, 'vehiclePlate', w.vehicle_plate,
                 'grossWeight', w.gross_weight, 'tareWeight', w.tare_weight, 'netWeight', w.net_weight,
                 'weighedAt', w.weighed_at, 'recordedBy', w.recorded_by
               ) ORDER BY w.weighed_at, w.id)
               FROM load_weighings w WHERE w.organization_id=l.organization_id AND w.load_id=l.id
             ), '[]'::jsonb) AS weighings
           FROM loads l
           LEFT JOIN suppliers supplier ON supplier.organization_id=l.organization_id AND supplier.id=l.supplier_id
           LEFT JOIN farms farm ON farm.organization_id=l.organization_id AND farm.id=l.farm_id
           LEFT JOIN plots plot ON plot.organization_id=l.organization_id AND plot.id=l.plot_id
           LEFT JOIN fronts front ON front.organization_id=l.organization_id AND front.id=l.front_id
           LEFT JOIN record_states rs
             ON rs.organization_id=l.organization_id AND rs.entity_type='load' AND rs.entity_id=l.id
           WHERE l.organization_id=$1 AND ($2::bigint IS NULL OR l.unit_id=$2)
             AND ($3::date IS NULL OR l.weighed_at >= $3::date)
             AND ($4::date IS NULL OR l.weighed_at < ($4::date + interval '1 day'))
           ORDER BY l.weighed_at DESC NULLS LAST, l.id`,
          [organizationId, unitId, periodStart, periodEnd], organizationId,
        )
        const sampleResult = await db.query(
          `SELECT s.id, s.unit_id, s.harvest_id, s.sample_code, s.sampled_at, s.load_id,
             s.source_id, linked_load.external_reference AS load_reference, linked_load.id AS linked_load_id,
             linked_load.supplier_id, linked_load.farm_id, linked_load.plot_id, linked_load.front_id,
             rs.operational_condition, rs.data_condition, rs.attention_priority,
             rs.investigation_status, rs.release_status, rs.origin_status, rs.updated_by, rs.updated_at,
             COALESCE(jsonb_agg(jsonb_build_object(
               'id', q.id, 'indicatorId', q.indicator_id, 'indicator', i.name,
               'value', q.valor_normalizado, 'unit', q.unidade_normalizada,
               'measuredAt', q.measured_at, 'validationStatus', q.validation_status,
               'measurementMode', q.measurement_mode, 'methodId', q.method_id,
               'method', am.name, 'equipmentId', q.equipment_id, 'equipment', e.name,
               'calibrationId', q.calibration_id, 'calibrationStatus', ec.status,
               'calibrationValidUntil', ec.valid_until, 'replicateOfId', q.replicate_of_id,
               'state', jsonb_build_object(
                 'operationalCondition', qs.operational_condition,
                 'dataCondition', qs.data_condition,
                 'attentionPriority', qs.attention_priority,
                 'investigationStatus', qs.investigation_status,
                 'releaseStatus', qs.release_status,
                 'originStatus', COALESCE(qs.origin_status,
                   CASE WHEN linked_load.supplier_id IS NOT NULL OR linked_load.farm_id IS NOT NULL
                       OR linked_load.plot_id IS NOT NULL OR linked_load.front_id IS NOT NULL
                     THEN 'informada' ELSE 'não_confirmada' END)
               )
             ) ORDER BY q.measured_at, q.id) FILTER (WHERE q.id IS NOT NULL), '[]'::jsonb) AS analyses
           FROM samples s
           LEFT JOIN loads linked_load ON linked_load.organization_id=s.organization_id AND linked_load.id=s.load_id
           LEFT JOIN quality_analyses q ON q.organization_id=s.organization_id AND q.sample_id=s.id
           LEFT JOIN indicator_definitions i ON i.organization_id=q.organization_id AND i.id=q.indicator_id
           LEFT JOIN analytical_methods am ON am.organization_id=q.organization_id AND am.id=q.method_id
           LEFT JOIN equipment e ON e.organization_id=q.organization_id AND e.id=q.equipment_id
           LEFT JOIN equipment_calibrations ec ON ec.organization_id=q.organization_id AND ec.id=q.calibration_id
           LEFT JOIN record_states rs
             ON rs.organization_id=s.organization_id AND rs.entity_type='sample' AND rs.entity_id=s.id
           LEFT JOIN record_states qs
             ON qs.organization_id=q.organization_id AND qs.entity_type='quality_analysis' AND qs.entity_id=q.id
           WHERE s.organization_id=$1 AND ($2::bigint IS NULL OR s.unit_id=$2)
             AND ($3::date IS NULL OR s.sampled_at >= $3::date)
             AND ($4::date IS NULL OR s.sampled_at < ($4::date + interval '1 day'))
           GROUP BY s.id, linked_load.external_reference, linked_load.id,
             rs.operational_condition, rs.data_condition, rs.attention_priority,
             rs.investigation_status, rs.release_status, rs.origin_status, rs.updated_by, rs.updated_at
           ORDER BY s.sampled_at DESC NULLS LAST, s.id`,
          [organizationId, unitId, periodStart, periodEnd], organizationId,
        )
        const loads = loadResult.rows.map((row) => {
          const orphanReasons = []
          if (!row.unit_id) orphanReasons.push('missing_unit')
          if (!row.external_reference) orphanReasons.push('missing_load_reference')
          if (!row.supplier_id && !row.farm_id && !row.plot_id && !row.front_id) orphanReasons.push('missing_origin_link')
          if (!Number(row.weighing_count) && !(row.gross_weight !== null && row.tare_weight !== null && row.weighed_at)) {
            orphanReasons.push('missing_weighing')
          }
          return {
            id: Number(row.id),
            unitId: row.unit_id === null ? null : Number(row.unit_id),
            harvestId: row.harvest_id === null ? null : Number(row.harvest_id),
            reference: row.external_reference,
            supplierId: row.supplier_id === null ? null : Number(row.supplier_id),
            supplierName: row.supplier_name,
            farmId: row.farm_id === null ? null : Number(row.farm_id),
            farmName: row.farm_name,
            plotId: row.plot_id === null ? null : Number(row.plot_id),
            plotName: row.plot_name,
            frontId: row.front_id === null ? null : Number(row.front_id),
            frontName: row.front_name,
            netWeight: row.net_weight,
            weightUnit: row.weight_unit,
            weighedAt: row.weighed_at,
            attributes: row.attributes,
            weighings: row.weighings,
            sampleCount: Number(row.sample_count),
            isOrphan: orphanReasons.length > 0,
            orphanReasons,
            states: operationalStateView(row),
          }
        })
        const samples = sampleResult.rows.map((row) => ({
          id: Number(row.id),
          unitId: row.unit_id === null ? null : Number(row.unit_id),
          harvestId: row.harvest_id === null ? null : Number(row.harvest_id),
          code: row.sample_code,
          sampledAt: row.sampled_at,
          loadId: row.load_id === null ? null : Number(row.load_id),
          loadReference: row.load_reference,
          isOrphan: !row.load_id || !row.linked_load_id,
          orphanReason: !row.load_id ? 'missing_load_link' : !row.linked_load_id ? 'load_not_found' : null,
          analyses: row.analyses,
          states: operationalStateView(row, row.inferred_origin_status),
        }))
        return json(response, 200, { loads, samples })
      }
      const stateMatch = pathname.match(/^\/api\/operations\/(loads|samples|quality-analyses|measurements|occurrences)\/(\d+)\/states$/)
      if (stateMatch && request.method === 'PATCH') {
        const [, entityType, rawId] = stateMatch
        const id = Number(rawId)
        const targets = {
          loads: {
            module: 'harvests', stateType: 'load',
            query: `SELECT id, unit_id,
              CASE WHEN supplier_id IS NOT NULL OR farm_id IS NOT NULL OR plot_id IS NOT NULL OR front_id IS NOT NULL
                THEN 'informada' ELSE 'não_confirmada' END AS inferred_origin_status
              FROM loads WHERE id=$1 AND organization_id=$2`,
          },
          samples: {
            module: 'quality', stateType: 'sample',
            query: `SELECT s.id, s.unit_id,
              CASE WHEN l.supplier_id IS NOT NULL OR l.farm_id IS NOT NULL OR l.plot_id IS NOT NULL OR l.front_id IS NOT NULL
                THEN 'informada' ELSE 'não_confirmada' END AS inferred_origin_status
              FROM samples s LEFT JOIN loads l ON l.organization_id=s.organization_id AND l.id=s.load_id
              WHERE s.id=$1 AND s.organization_id=$2`,
          },
          'quality-analyses': {
            module: 'quality', stateType: 'quality_analysis',
            query: `SELECT qa.id, s.unit_id,
              CASE WHEN l.supplier_id IS NOT NULL OR l.farm_id IS NOT NULL OR l.plot_id IS NOT NULL OR l.front_id IS NOT NULL
                THEN 'informada' ELSE 'não_confirmada' END AS inferred_origin_status
              FROM quality_analyses qa JOIN samples s
                ON s.organization_id=qa.organization_id AND s.id=qa.sample_id
              LEFT JOIN loads l ON l.organization_id=s.organization_id AND l.id=s.load_id
              WHERE qa.id=$1 AND qa.organization_id=$2`,
          },
          measurements: {
            module: 'measurements', stateType: 'measurement',
            query: `SELECT id, unit_id, 'não_confirmada' AS inferred_origin_status
              FROM measurements WHERE id=$1 AND organization_id=$2`,
          },
          occurrences: {
            module: 'occurrences', stateType: 'occurrence',
            query: `SELECT id, unit_id, 'não_confirmada' AS inferred_origin_status
              FROM occurrences WHERE id=$1 AND organization_id=$2`,
          },
        }
        const target = targets[entityType]
        if (!Number.isSafeInteger(id) || id < 1) return error(response, 400, 'identificador de registro inválido.')
        if (!hasPermission(accessContext, target.module, 'can_write')) return forbidden(response)
        const targetResult = await db.query(target.query, [id, organizationId], organizationId)
        if (!targetResult.rowCount) return error(response, 404, 'registro não encontrado.')
        const unitId = targetResult.rows[0].unit_id
        if (unitId !== null && !hasUnitScope(accessContext, unitId)) return forbidden(response)
        const requested = {}
        for (const [apiName, column] of Object.entries({
          operationalCondition: 'operational_condition',
          dataCondition: 'data_condition',
          attentionPriority: 'attention_priority',
          investigationStatus: 'investigation_status',
          releaseStatus: 'release_status',
        })) {
          if (!Object.hasOwn(body, apiName)) continue
          if (!recordStateValues[apiName].includes(body[apiName])) return error(response, 400, `valor inválido para ${apiName}.`)
          if (apiName === 'investigationStatus' && target.stateType === 'occurrence') {
            return error(response, 409, 'a situação de investigação de ocorrências deve avançar pelo workflow.')
          }
          requested[column] = body[apiName]
        }
        if (Object.hasOwn(body, 'originStatus')) {
          if (!['informada', 'validada', 'não_confirmada'].includes(body.originStatus)) {
            return error(response, 400, 'originStatus deve ser informada, validada ou não_confirmada.')
          }
          if (body.originStatus === 'validada' &&
            (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'quality', 'can_approve_release'))) return forbidden(response)
          requested.origin_status = body.originStatus
        }
        if (!Object.keys(requested).length) return error(response, 400, 'informe ao menos um estado independente para atualizar.')
        const justification = typeof body.justification === 'string' ? body.justification.trim() : ''
        if (justification.length < 10 || justification.length > 2000) {
          return error(response, 400, 'informe uma justificativa de 10 a 2000 caracteres.')
        }
        if (requested.release_status !== undefined) {
          if (requested.release_status === 'normal') {
            return error(response, 409, 'a liberação normal deve ser registrada pela rota de aprovação.')
          }
          if (isOperationalOrIntern(accessContext) || !hasPermission(accessContext, 'quality', 'can_approve_release')) return forbidden(response)
        }
        const result = await db.transaction(async (client) => {
          const current = await client.query(
            'SELECT * FROM record_states WHERE organization_id=$1 AND entity_type=$2 AND entity_id=$3',
            [organizationId, target.stateType, id],
          )
          const before = current.rows[0] || {
            operational_condition: 'unknown',
            data_condition: 'pendente',
            attention_priority: 'none',
            investigation_status: 'not_started',
            release_status: 'pending',
            origin_status: targetResult.rows[0].inferred_origin_status || 'não_confirmada',
          }
          const after = { ...before, ...requested }
          await client.query(
            `INSERT INTO record_states
               (organization_id, entity_type, entity_id, unit_id, operational_condition, data_condition,
                attention_priority, investigation_status, release_status, origin_status, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (organization_id, entity_type, entity_id) DO UPDATE SET
               operational_condition=EXCLUDED.operational_condition,
               data_condition=EXCLUDED.data_condition,
               attention_priority=EXCLUDED.attention_priority,
               investigation_status=EXCLUDED.investigation_status,
               release_status=EXCLUDED.release_status,
               origin_status=EXCLUDED.origin_status,
               updated_by=EXCLUDED.updated_by, updated_at=now()`,
            [
              organizationId, target.stateType, id, unitId,
              after.operational_condition, after.data_condition, after.attention_priority,
              after.investigation_status, after.release_status, after.origin_status, authenticated.id,
            ],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'operational_state_updated',
            entityType: target.stateType, entityId: id, justification,
            beforeData: before, afterData: after,
          })
          return after
        }, accessContext)
        return json(response, 200, {
          entityType: target.stateType,
          entityId: id,
          states: operationalStateView(result, targetResult.rows[0].inferred_origin_status),
        })
      }
      if (pathname === '/api/occurrences' && request.method === 'GET') {
        if (!hasPermission(accessContext, 'occurrences', 'can_read')) return forbidden(response)
        const occurrences = await db.query(
          `SELECT o.id, o.unit_id, o.equipment_id, o.indicator_id, o.title, o.description,
             o.severity, o.status AS legacy_status, o.occurred_at, o.responsible_user_id,
             owner.name AS responsible_name, o.due_at, o.period_start, o.period_end,
             o.affected_scope, rs.operational_condition, rs.data_condition, rs.attention_priority,
             rs.investigation_status, rs.release_status, rs.updated_by, rs.updated_at,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'id', ev.id, 'type', ev.evidence_type, 'metricCode', ev.metric_code,
                 'loadId', ev.load_id, 'sampleId', ev.sample_id,
                 'periodStart', ev.period_start, 'periodEnd', ev.period_end,
                 'details', ev.details, 'recordedBy', ev.recorded_by, 'recordedAt', ev.recorded_at
               ) ORDER BY ev.recorded_at, ev.id)
               FROM occurrence_evidence ev
               WHERE ev.organization_id=o.organization_id AND ev.occurrence_id=o.id
             ), '[]'::jsonb) AS evidence,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                 'from', we.from_status, 'to', we.to_status,
                 'actorUserId', we.actor_user_id, 'actionId', we.action_id,
                 'note', we.note, 'createdAt', we.created_at
               ) ORDER BY we.created_at, we.id)
               FROM occurrence_workflow_events we
               WHERE we.organization_id=o.organization_id AND we.occurrence_id=o.id
             ), '[]'::jsonb) AS workflow,
             (
               SELECT jsonb_build_object(
                 'result', v.result, 'reincidence', v.reincidence,
                 'verifiedBy', v.verified_by, 'verifiedAt', v.verified_at
               )
               FROM occurrence_verifications v
               WHERE v.organization_id=o.organization_id AND v.occurrence_id=o.id
               ORDER BY v.verified_at DESC, v.id DESC LIMIT 1
             ) AS verification
           FROM occurrences o
           LEFT JOIN users owner ON owner.organization_id=o.organization_id AND owner.id=o.responsible_user_id
           LEFT JOIN record_states rs
             ON rs.organization_id=o.organization_id AND rs.entity_type='occurrence' AND rs.entity_id=o.id
           WHERE o.organization_id=$1
           ORDER BY o.occurred_at DESC, o.id DESC`,
          [organizationId], organizationId,
        )
        return json(response, 200, occurrences.rows.map((row) => ({
          id: Number(row.id),
          unitId: row.unit_id === null ? null : Number(row.unit_id),
          equipmentId: row.equipment_id === null ? null : Number(row.equipment_id),
          indicatorId: row.indicator_id === null ? null : Number(row.indicator_id),
          title: row.title,
          description: row.description,
          severity: row.severity,
          status: row.investigation_status || 'open',
          legacyStatus: row.legacy_status,
          occurredAt: row.occurred_at,
          responsible: row.responsible_user_id
            ? { userId: row.responsible_user_id, name: row.responsible_name }
            : null,
          dueAt: row.due_at,
          affectedPeriod: { start: row.period_start, end: row.period_end },
          affectedScope: row.affected_scope,
          states: operationalStateView(row),
          evidence: row.evidence,
          workflow: row.workflow,
          verification: row.verification,
        })))
      }
      if (pathname === '/api/occurrences' && request.method === 'POST') {
        if (!hasPermission(accessContext, 'occurrences', 'can_write')) return forbidden(response)
        const unitId = Number(body.unitId)
        const responsibleUserId = typeof body.responsibleUserId === 'string' ? body.responsibleUserId.trim() : ''
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        const description = typeof body.description === 'string' ? body.description.trim() : ''
        const occurredAt = typeof body.occurredAt === 'string' ? Date.parse(body.occurredAt) : Number.NaN
        const dueAt = typeof body.dueAt === 'string' ? Date.parse(body.dueAt) : Number.NaN
        const periodStart = body.periodStart
        const periodEnd = body.periodEnd
        const validDate = (value) => typeof value === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(value) &&
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
        const evidence = parseOccurrenceEvidence(body.evidence)
        const scope = body.affectedScope
        if (!Number.isSafeInteger(unitId) || unitId < 1 || !responsibleUserId ||
          title.length < 5 || title.length > 200 || hasControlCharacter(title) ||
          description.length > 4000 || hasControlCharacter(description) ||
          !Number.isFinite(occurredAt) || occurredAt > Date.now() ||
          !Number.isFinite(dueAt) || dueAt < occurredAt ||
          !validDate(periodStart) || !validDate(periodEnd) || periodStart > periodEnd ||
          !scope || typeof scope !== 'object' || Array.isArray(scope) ||
          !Object.keys(scope).length || JSON.stringify(scope).length > 10000 ||
          !evidence || !['low', 'medium', 'high', 'critical'].includes(body.severity)) {
          return error(response, 400, 'informe unidade, título, gravidade, responsável, prazo, recorte, escopo afetado e ao menos uma evidência válida.')
        }
        if (!hasUnitScope(accessContext, unitId)) return forbidden(response)
        const occurrenceState = {
          operationalCondition: body.operationalCondition || 'unknown',
          dataCondition: body.dataCondition || 'pendente',
          attentionPriority: body.attentionPriority || 'none',
          releaseStatus: 'pending',
        }
        for (const [field, value] of Object.entries(occurrenceState)) {
          if (!recordStateValues[field].includes(value)) return error(response, 400, `valor inválido para ${field}.`)
        }
        if (Object.hasOwn(body, 'releaseStatus')) {
          return error(response, 409, 'a situação de liberação deve ser registrada após a criação da ocorrência.')
        }
        const created = await db.transaction(async (client) => {
          const unit = await client.query('SELECT id FROM units WHERE organization_id=$1 AND id=$2', [organizationId, unitId])
          if (!unit.rowCount) throw Object.assign(new Error('usina não encontrada.'), { status: 400 })
          const responsible = await client.query(
            'SELECT id FROM users WHERE organization_id=$1 AND id=$2',
            [organizationId, responsibleUserId],
          )
          if (!responsible.rowCount) throw Object.assign(new Error('responsável não encontrado.'), { status: 400 })
          let equipmentId = null
          if (body.equipmentId !== undefined && body.equipmentId !== null) {
            equipmentId = Number(body.equipmentId)
            if (!Number.isSafeInteger(equipmentId) || equipmentId < 1) throw Object.assign(new Error('equipamento inválido.'), { status: 400 })
            const equipment = await client.query(
              'SELECT id FROM equipment WHERE organization_id=$1 AND id=$2 AND unit_id=$3',
              [organizationId, equipmentId, unitId],
            )
            if (!equipment.rowCount) throw Object.assign(new Error('equipamento não pertence à unidade.'), { status: 400 })
          }
          let indicatorId = null
          if (body.indicatorId !== undefined && body.indicatorId !== null) {
            indicatorId = Number(body.indicatorId)
            if (!Number.isSafeInteger(indicatorId) || indicatorId < 1) throw Object.assign(new Error('indicador inválido.'), { status: 400 })
            const indicator = await client.query(
              'SELECT id FROM indicator_definitions WHERE organization_id=$1 AND id=$2',
              [organizationId, indicatorId],
            )
            if (!indicator.rowCount) throw Object.assign(new Error('indicador não encontrado.'), { status: 400 })
          }
          const occurrence = await client.query(
            `INSERT INTO occurrences
               (organization_id, unit_id, equipment_id, indicator_id, title, description,
                severity, status, occurred_at, responsible_user_id, due_at, period_start,
                period_end, affected_scope)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'open',$8,$9,$10,$11,$12,$13::jsonb)
             RETURNING id`,
            [
              organizationId, unitId, equipmentId, indicatorId, title, description,
              body.severity, new Date(occurredAt).toISOString(), responsibleUserId,
              new Date(dueAt).toISOString(), periodStart, periodEnd, JSON.stringify(scope),
            ],
          )
          const occurrenceId = Number(occurrence.rows[0].id)
          const createdAt = nowIso()
          const evidenceResult = await insertOccurrenceEvidence(client, {
            organizationId, unitId, occurrenceId, actorUserId: authenticated.id,
            evidence, periodStart, periodEnd,
          })
          if (evidenceResult.error) throw Object.assign(new Error('evidência não pertence à ocorrência ou ao seu escopo.'), { status: 400 })
          await client.query(
            `INSERT INTO record_states
               (organization_id, entity_type, entity_id, unit_id, operational_condition, data_condition,
                attention_priority, investigation_status, release_status, updated_by)
             VALUES ($1,'occurrence',$2,$3,$4,$5,$6,'open',$7,$8)`,
            [
              organizationId, occurrenceId, unitId, occurrenceState.operationalCondition,
              occurrenceState.dataCondition, occurrenceState.attentionPriority,
              occurrenceState.releaseStatus, authenticated.id,
            ],
          )
          await client.query(
            `INSERT INTO occurrence_workflow_events
               (organization_id, occurrence_id, unit_id, from_status, to_status, actor_user_id, note)
             VALUES ($1,$2,$3,NULL,'open',$4,'ocorrência criada')`,
            [organizationId, occurrenceId, unitId, authenticated.id],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'occurrence_created',
            entityType: 'occurrence', entityId: occurrenceId,
            afterData: {
              title, severity: body.severity, responsibleUserId, dueAt: new Date(dueAt).toISOString(),
              periodStart, periodEnd, affectedScope: scope, evidenceCount: evidence.length,
            },
          })
          return { id: occurrenceId, createdAt }
        }, accessContext)
        return json(response, 201, {
          ...created,
          status: 'open',
          statusLabel: occurrenceWorkflow.open.label,
          evidenceCount: evidence.length,
        })
      }
      const occurrenceWorkflowMatch = pathname.match(/^\/api\/occurrences\/(\d+)\/workflow$/)
      if (occurrenceWorkflowMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'occurrences', 'can_write')) return forbidden(response)
        const occurrenceId = Number(occurrenceWorkflowMatch[1])
        const nextStatus = body.nextStatus
        const note = typeof body.note === 'string' ? body.note.trim() : ''
        if (!Number.isSafeInteger(occurrenceId) || occurrenceId < 1 ||
          !Object.hasOwn(occurrenceWorkflow, nextStatus) || note.length > 2000) {
          return error(response, 400, 'identificador, próxima etapa ou nota de workflow inválidos.')
        }
        const optionalEvidence = body.evidence === undefined ? [] : parseOccurrenceEvidence(body.evidence)
        if (optionalEvidence === null) return error(response, 400, 'as evidências adicionais são inválidas.')
        const verificationResult = typeof body.verificationResult === 'string' ? body.verificationResult.trim() : ''
        if (nextStatus === 'verified' &&
          (verificationResult.length < 10 || verificationResult.length > 4000 || typeof body.reincidence !== 'boolean')) {
          return error(response, 400, 'a verificação exige resultado de 10 a 4000 caracteres e reincidence booleano.')
        }
        const transitioned = await db.transaction(async (client) => {
          const currentResult = await client.query(
            `SELECT o.id, o.unit_id, o.status, o.responsible_user_id, o.due_at, o.period_start, o.period_end,
               rs.investigation_status
             FROM occurrences o
             LEFT JOIN record_states rs
               ON rs.organization_id=o.organization_id AND rs.entity_type='occurrence' AND rs.entity_id=o.id
             WHERE o.organization_id=$1 AND o.id=$2
             FOR UPDATE OF o`,
            [organizationId, occurrenceId],
          )
          if (!currentResult.rowCount) return { error: 'not_found' }
          const occurrence = currentResult.rows[0]
          if (!hasUnitScope(accessContext, occurrence.unit_id)) return { error: 'forbidden' }
          const currentStatus = occurrence.investigation_status || 'open'
          if (!isValidOccurrenceTransition(currentStatus, nextStatus)) return { error: 'invalid_transition', currentStatus }
          const evidenceResult = optionalEvidence.length
            ? await insertOccurrenceEvidence(client, {
              organizationId, unitId: occurrence.unit_id, occurrenceId, actorUserId: authenticated.id,
              evidence: optionalEvidence, periodStart: occurrence.period_start, periodEnd: occurrence.period_end,
            })
            : { error: null }
          if (evidenceResult.error) return { error: evidenceResult.error }
          let actionId = null
          if (nextStatus === 'action_defined') {
            const actionDescription = typeof body.actionDescription === 'string' ? body.actionDescription.trim() : ''
            const actionOwnerId = typeof body.actionOwnerId === 'string' ? body.actionOwnerId : occurrence.responsible_user_id
            const actionDueAt = typeof body.actionDueAt === 'string' ? Date.parse(body.actionDueAt) : Date.parse(occurrence.due_at)
            if (actionDescription.length < 5 || actionDescription.length > 2000 ||
              !actionOwnerId || !Number.isFinite(actionDueAt)) return { error: 'action_required' }
            const owner = await client.query(
              'SELECT id FROM users WHERE organization_id=$1 AND id=$2',
              [organizationId, actionOwnerId],
            )
            if (!owner.rowCount) return { error: 'action_owner_not_found' }
            const action = await client.query(
              `INSERT INTO actions
                 (organization_id, occurrence_id, assigned_to, description, status, due_at, unit_id)
               VALUES ($1,$2,$3,$4,'open',$5,$6) RETURNING id`,
              [organizationId, occurrenceId, actionOwnerId, actionDescription, new Date(actionDueAt).toISOString(), occurrence.unit_id],
            )
            actionId = Number(action.rows[0].id)
          }
          if (nextStatus === 'executed') {
            const action = await client.query(
              `SELECT id FROM actions
               WHERE organization_id=$1 AND occurrence_id=$2 AND status IN ('open','in_progress')
               ORDER BY id DESC LIMIT 1 FOR UPDATE`,
              [organizationId, occurrenceId],
            )
            if (!action.rowCount) return { error: 'action_not_defined' }
            actionId = Number(action.rows[0].id)
            await client.query(
              `UPDATE actions SET status='completed'
               WHERE organization_id=$1 AND id=$2`,
              [organizationId, actionId],
            )
          }
          if (nextStatus === 'verified') {
            const action = await client.query(
              `SELECT id FROM actions WHERE organization_id=$1 AND occurrence_id=$2 AND status='completed'
               ORDER BY id DESC LIMIT 1`,
              [organizationId, occurrenceId],
            )
            if (!action.rowCount) return { error: 'action_not_executed' }
            await client.query(
              `INSERT INTO occurrence_verifications
                 (organization_id, occurrence_id, unit_id, result, reincidence, verified_by)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [organizationId, occurrenceId, occurrence.unit_id, verificationResult, body.reincidence, authenticated.id],
            )
            actionId = Number(action.rows[0].id)
          }
          const legacyStatus = nextStatus === 'open'
            ? 'open'
            : nextStatus === 'verified' ? 'resolved' : 'investigating'
          await client.query(
            `UPDATE occurrences SET status=$1, closed_at=CASE WHEN $1='resolved' THEN now() ELSE NULL END
             WHERE organization_id=$2 AND id=$3`,
            [legacyStatus, organizationId, occurrenceId],
          )
          await client.query(
            `UPDATE record_states SET investigation_status=$1, updated_by=$2, updated_at=now()
             WHERE organization_id=$3 AND entity_type='occurrence' AND entity_id=$4`,
            [nextStatus, authenticated.id, organizationId, occurrenceId],
          )
          await client.query(
            `INSERT INTO occurrence_workflow_events
               (organization_id, occurrence_id, unit_id, from_status, to_status, actor_user_id, action_id, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [organizationId, occurrenceId, occurrence.unit_id, currentStatus, nextStatus, authenticated.id, actionId, note],
          )
          const after = {
            status: nextStatus,
            actionId,
            verificationResult: nextStatus === 'verified' ? verificationResult : null,
            reincidence: nextStatus === 'verified' ? body.reincidence : null,
          }
          await appendAuditLog(client, {
            organizationId, unitId: occurrence.unit_id, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'occurrence_workflow_transition',
            entityType: 'occurrence', entityId: occurrenceId, beforeData: { status: currentStatus }, afterData: after,
          })
          return { status: nextStatus, actionId }
        }, accessContext)
        if (transitioned.error === 'forbidden') return forbidden(response)
        if (transitioned.error === 'not_found') return error(response, 404, 'ocorrência não encontrada.')
        if (transitioned.error === 'invalid_transition') {
          return error(response, 409, `transição inválida: ${occurrenceWorkflow[transitioned.currentStatus]?.label || transitioned.currentStatus} não pode avançar para ${occurrenceWorkflow[nextStatus].label}.`)
        }
        if (transitioned.error === 'action_required') return error(response, 400, 'defina descrição, responsável e prazo da ação.')
        if (transitioned.error === 'action_owner_not_found') return error(response, 400, 'responsável da ação não encontrado.')
        if (transitioned.error === 'action_not_defined') return error(response, 409, 'defina uma ação antes de registrá-la como executada.')
        if (transitioned.error === 'action_not_executed') return error(response, 409, 'execute a ação antes de verificar sua eficácia.')
        if (transitioned.error) return error(response, 400, 'evidência não pertence à ocorrência ou ao seu escopo.')
        return json(response, 200, {
          occurrenceId,
          status: transitioned.status,
          statusLabel: occurrenceWorkflow[transitioned.status].label,
          actionId: transitioned.actionId,
        })
      }
      const weighingMatch = pathname.match(/^\/api\/operations\/loads\/(\d+)\/weighings$/)
      if (weighingMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'harvests', 'can_write')) return forbidden(response)
        const loadId = Number(weighingMatch[1])
        const vehiclePlate = typeof body.vehiclePlate === 'string' ? body.vehiclePlate.trim().toUpperCase() : ''
        const grossWeight = numericInput(body.grossWeight)
        const tareWeight = numericInput(body.tareWeight)
        const weighedAt = typeof body.weighedAt === 'string' ? Date.parse(body.weighedAt) : Number.NaN
        if (!Number.isSafeInteger(loadId) || loadId < 1 ||
          !['entry', 'exit'].includes(body.weighingType) ||
          vehiclePlate.length < 2 || vehiclePlate.length > 20 || hasControlCharacter(vehiclePlate) ||
          grossWeight === null || tareWeight === null ||
          grossWeight < tareWeight || grossWeight >= 1e13 || tareWeight < 0 ||
          !Number.isFinite(weighedAt) || weighedAt > Date.now()) {
          return error(response, 400, 'informe carga, etapa, placa, pesos válidos e horário de pesagem não futuro.')
        }
        const load = await db.query(
          'SELECT id, unit_id FROM loads WHERE organization_id=$1 AND id=$2',
          [organizationId, loadId], organizationId,
        )
        if (!load.rowCount) return error(response, 404, 'carga não encontrada.')
        const unitId = load.rows[0].unit_id
        if (!unitId || !hasUnitScope(accessContext, unitId)) return forbidden(response)
        const weighing = await db.transaction(async (client) => {
          const inserted = await client.query(
            `INSERT INTO load_weighings
               (organization_id, load_id, unit_id, weighing_type, vehicle_plate,
                gross_weight, tare_weight, weighed_at, recorded_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             RETURNING id, net_weight, weighed_at`,
            [
              organizationId, loadId, unitId, body.weighingType, vehiclePlate,
              grossWeight, tareWeight, new Date(weighedAt).toISOString(), authenticated.id,
            ],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'load_weighing_recorded',
            entityType: 'load', entityId: loadId,
            afterData: {
              weighingId: Number(inserted.rows[0].id), weighingType: body.weighingType,
              vehiclePlate, grossWeight, tareWeight, netWeight: Number(inserted.rows[0].net_weight),
              weighedAt: inserted.rows[0].weighed_at,
            },
          })
          return inserted.rows[0]
        }, accessContext)
        return json(response, 201, {
          id: Number(weighing.id),
          loadId,
          unitId: Number(unitId),
          weighingType: body.weighingType,
          vehiclePlate,
          grossWeight,
          tareWeight,
          netWeight: Number(weighing.net_weight),
          weighedAt: weighing.weighed_at,
        })
      }
      const analysisMatch = pathname.match(/^\/api\/operations\/samples\/(\d+)\/analyses$/)
      if (analysisMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'quality', 'can_write')) return forbidden(response)
        const sampleId = Number(analysisMatch[1])
        const indicatorId = Number(body.indicatorId)
        const methodId = Number(body.methodId)
        const value = numericInput(body.value)
        const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
        const measuredAt = typeof body.measuredAt === 'string' ? Date.parse(body.measuredAt) : Number.NaN
        const measurementMode = body.measurementMode
        const equipmentId = body.equipmentId === undefined || body.equipmentId === null ? null : Number(body.equipmentId)
        const calibrationId = body.calibrationId === undefined || body.calibrationId === null ? null : Number(body.calibrationId)
        const replicateOfId = body.replicateOfId === undefined || body.replicateOfId === null ? null : Number(body.replicateOfId)
        if (!Number.isSafeInteger(sampleId) || sampleId < 1 ||
          !Number.isSafeInteger(indicatorId) || indicatorId < 1 ||
          !Number.isSafeInteger(methodId) || methodId < 1 ||
          value === null || Math.abs(value) >= 1e100 ||
          unit.length < 1 || unit.length > 40 || hasControlCharacter(unit) ||
          !Number.isFinite(measuredAt) || measuredAt > Date.now() ||
          !['automatic', 'manual'].includes(measurementMode) ||
          (equipmentId !== null && (!Number.isSafeInteger(equipmentId) || equipmentId < 1)) ||
          (calibrationId !== null && (!Number.isSafeInteger(calibrationId) || calibrationId < 1)) ||
          (replicateOfId !== null && (!Number.isSafeInteger(replicateOfId) || replicateOfId < 1)) ||
          (measurementMode === 'automatic' && (!equipmentId || !calibrationId))) {
          return error(response, 400, 'informe amostra, indicador, método, modalidade, resultado e metadados compatíveis.')
        }
        const created = await db.transaction(async (client) => {
          const sample = await client.query(
            `SELECT s.id, s.unit_id, s.source_id, l.supplier_id, l.farm_id, l.plot_id, l.front_id
             FROM samples s LEFT JOIN loads l ON l.organization_id=s.organization_id AND l.id=s.load_id
             WHERE s.organization_id=$1 AND s.id=$2`,
            [organizationId, sampleId],
          )
          if (!sample.rowCount) return { error: 'sample_not_found' }
          const unitId = sample.rows[0].unit_id
          if (!unitId || !hasUnitScope(accessContext, unitId)) return { error: 'forbidden' }
          const [indicator, method] = await Promise.all([
            client.query('SELECT id FROM indicator_definitions WHERE organization_id=$1 AND id=$2', [organizationId, indicatorId]),
            client.query('SELECT id FROM analytical_methods WHERE organization_id=$1 AND id=$2', [organizationId, methodId]),
          ])
          if (!indicator.rowCount) return { error: 'indicator_not_found' }
          if (!method.rowCount) return { error: 'method_not_found' }
          if (equipmentId !== null) {
            const equipment = await client.query(
              'SELECT id, unit_id FROM equipment WHERE organization_id=$1 AND id=$2',
              [organizationId, equipmentId],
            )
            if (!equipment.rowCount || Number(equipment.rows[0].unit_id) !== Number(unitId)) return { error: 'equipment_mismatch' }
          }
          if (calibrationId !== null) {
            const calibration = await client.query(
              `SELECT id FROM equipment_calibrations
               WHERE organization_id=$1 AND id=$2 AND equipment_id=$3 AND unit_id=$4
                 AND status='valid' AND calibrated_at <= $5 AND valid_until >= $5`,
              [organizationId, calibrationId, equipmentId, unitId, new Date(measuredAt).toISOString()],
            )
            if (!calibration.rowCount) return { error: 'calibration_invalid' }
          }
          if (replicateOfId !== null) {
            const original = await client.query(
              `SELECT id FROM quality_analyses
               WHERE organization_id=$1 AND id=$2 AND sample_id=$3 AND indicator_id=$4`,
              [organizationId, replicateOfId, sampleId, indicatorId],
            )
            if (!original.rowCount) return { error: 'replicate_mismatch' }
          }
          const timestamp = nowIso()
          const inserted = await client.query(
            `INSERT INTO quality_analyses
               (organization_id, sample_id, indicator_id, method_id, source_id, unit_id,
                valor_original, unidade_original, valor_normalizado, unidade_normalizada,
                regra_aplicada, versao_processamento, responsavel_ou_processo,
                measured_at, received_at, processed_at, released_at, validation_status,
                measurement_mode, equipment_id, calibration_id, replicate_of_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,NULL,'lab-api-v1',$10,$11,$12,$12,$12,
                'pending',$13,$14,$15,$16)
             RETURNING id, measured_at, received_at`,
            [
              organizationId, sampleId, indicatorId, methodId, sample.rows[0].source_id,
              unitId, String(body.value), unit, value, authenticated.id,
              new Date(measuredAt).toISOString(), timestamp, measurementMode,
              equipmentId, calibrationId, replicateOfId,
            ],
          )
          const originStatus = sample.rows[0].supplier_id || sample.rows[0].farm_id ||
            sample.rows[0].plot_id || sample.rows[0].front_id ? 'informada' : 'não_confirmada'
          await client.query(
            `INSERT INTO record_states
               (organization_id, entity_type, entity_id, unit_id, data_condition, origin_status, updated_by)
             VALUES ($1,'quality_analysis',$2,$3,'pendente',$4,$5)`,
            [organizationId, Number(inserted.rows[0].id), unitId, originStatus, authenticated.id],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'quality_analysis_recorded',
            entityType: 'quality_analysis', entityId: inserted.rows[0].id,
            afterData: {
              sampleId, indicatorId, methodId, measurementMode, equipmentId, calibrationId,
              replicateOfId, value: String(body.value), unit, measuredAt: new Date(measuredAt).toISOString(),
            },
          })
          return {
            id: Number(inserted.rows[0].id),
            sampleId,
            unitId: Number(unitId),
            indicatorId,
            methodId,
            measurementMode,
            equipmentId,
            calibrationId,
            replicateOfId,
            value,
            unit,
            measuredAt: inserted.rows[0].measured_at,
            validationStatus: 'pending',
          }
        }, accessContext)
        if (created.error === 'forbidden') return forbidden(response)
        if (created.error === 'sample_not_found') return error(response, 404, 'amostra não encontrada.')
        if (created.error === 'indicator_not_found') return error(response, 400, 'indicador não encontrado.')
        if (created.error === 'method_not_found') return error(response, 400, 'método analítico não encontrado.')
        if (created.error === 'equipment_mismatch') return error(response, 400, 'equipamento não pertence à usina da amostra.')
        if (created.error === 'calibration_invalid') return error(response, 409, 'calibração não válida para o equipamento e horário da análise.')
        if (created.error === 'replicate_mismatch') return error(response, 400, 'a repetição deve apontar para análise da mesma amostra e indicador.')
        return json(response, 201, created)
      }
      const calibrationMatch = pathname.match(/^\/api\/operations\/equipment\/(\d+)\/calibrations$/)
      if (calibrationMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'quality', 'can_read')) return forbidden(response)
        const equipmentId = Number(calibrationMatch[1])
        if (!Number.isSafeInteger(equipmentId) || equipmentId < 1) return error(response, 400, 'identificador de equipamento inválido.')
        const equipment = await db.query(
          'SELECT id, unit_id FROM equipment WHERE organization_id=$1 AND id=$2',
          [organizationId, equipmentId], organizationId,
        )
        if (!equipment.rowCount) return error(response, 404, 'equipamento não encontrado.')
        if (!equipment.rows[0].unit_id || !hasUnitScope(accessContext, equipment.rows[0].unit_id)) return forbidden(response)
        const calibrations = await db.query(
          `SELECT c.id, c.unit_id, c.certificate_reference, c.calibrated_at, c.valid_until,
             c.status, c.method_id, m.name AS method, c.performed_by, u.name AS performed_by_name,
             c.notes, c.recorded_at
           FROM equipment_calibrations c
           LEFT JOIN analytical_methods m ON m.organization_id=c.organization_id AND m.id=c.method_id
           JOIN users u ON u.organization_id=c.organization_id AND u.id=c.performed_by
           WHERE c.organization_id=$1 AND c.equipment_id=$2
           ORDER BY c.calibrated_at DESC, c.id DESC`,
          [organizationId, equipmentId], organizationId,
        )
        return json(response, 200, calibrations.rows.map((row) => ({
          id: Number(row.id),
          unitId: Number(row.unit_id),
          certificateReference: row.certificate_reference,
          calibratedAt: row.calibrated_at,
          validUntil: row.valid_until,
          status: row.status,
          methodId: row.method_id === null ? null : Number(row.method_id),
          method: row.method,
          performedBy: { userId: row.performed_by, name: row.performed_by_name },
          notes: row.notes,
          recordedAt: row.recorded_at,
        })))
      }
      if (calibrationMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'quality', 'can_write')) return forbidden(response)
        const equipmentId = Number(calibrationMatch[1])
        const certificateReference = typeof body.certificateReference === 'string' ? body.certificateReference.trim() : ''
        const calibratedAt = typeof body.calibratedAt === 'string' ? Date.parse(body.calibratedAt) : Number.NaN
        const validUntil = typeof body.validUntil === 'string' ? Date.parse(body.validUntil) : Number.NaN
        const notes = typeof body.notes === 'string' ? body.notes.trim() : ''
        const validityMismatch = body.status === 'valid' && validUntil < Date.now() ||
          body.status === 'expired' && validUntil >= Date.now()
        if (!Number.isSafeInteger(equipmentId) || equipmentId < 1 ||
          certificateReference.length < 1 || certificateReference.length > 160 || hasControlCharacter(certificateReference) ||
          !Number.isFinite(calibratedAt) || !Number.isFinite(validUntil) || validUntil < calibratedAt ||
          calibratedAt > Date.now() || !['valid', 'expired', 'rejected'].includes(body.status) ||
          validityMismatch || notes.length > 2000 || hasControlCharacter(notes)) {
          return error(response, 400, 'informe certificado, datas, situação e observações válidos para calibração.')
        }
        const equipment = await db.query(
          'SELECT id, unit_id FROM equipment WHERE organization_id=$1 AND id=$2',
          [organizationId, equipmentId], organizationId,
        )
        if (!equipment.rowCount) return error(response, 404, 'equipamento não encontrado.')
        const unitId = equipment.rows[0].unit_id
        if (!unitId || !hasUnitScope(accessContext, unitId)) return forbidden(response)
        const methodId = body.methodId === undefined || body.methodId === null ? null : Number(body.methodId)
        if (methodId !== null) {
          if (!Number.isSafeInteger(methodId) || methodId < 1) return error(response, 400, 'método analítico inválido.')
          const method = await db.query(
            'SELECT id FROM analytical_methods WHERE organization_id=$1 AND id=$2',
            [organizationId, methodId], organizationId,
          )
          if (!method.rowCount) return error(response, 400, 'método analítico não encontrado.')
        }
        const calibration = await db.transaction(async (client) => {
          const inserted = await client.query(
            `INSERT INTO equipment_calibrations
               (organization_id, equipment_id, unit_id, certificate_reference, calibrated_at,
                valid_until, status, method_id, performed_by, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id, recorded_at`,
            [
              organizationId, equipmentId, unitId, certificateReference,
              new Date(calibratedAt).toISOString(), new Date(validUntil).toISOString(),
              body.status, methodId, authenticated.id, notes,
            ],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'equipment_calibration_recorded',
            entityType: 'equipment', entityId: equipmentId,
            afterData: {
              calibrationId: Number(inserted.rows[0].id), certificateReference,
              calibratedAt: new Date(calibratedAt).toISOString(),
              validUntil: new Date(validUntil).toISOString(), status: body.status, methodId, notes,
            },
          })
          return inserted.rows[0]
        }, accessContext)
        return json(response, 201, {
          id: Number(calibration.id), equipmentId, unitId: Number(unitId),
          certificateReference, calibratedAt: new Date(calibratedAt).toISOString(),
          validUntil: new Date(validUntil).toISOString(), status: body.status,
          methodId, performedBy: authenticated.id, recordedAt: calibration.recorded_at,
        })
      }
      const correctionMatch = pathname.match(/^\/api\/measurements\/(\d+)\/corrections$/)
      if (correctionMatch && request.method === 'POST') {
        if (!hasPermission(accessContext, 'measurements', 'can_write')) return forbidden(response)
        const originalId = Number(correctionMatch[1])
        const value = numericInput(body.value)
        const unit = typeof body.unit === 'string' ? body.unit.trim() : ''
        const justification = typeof body.justification === 'string' ? body.justification.trim() : ''
        const measuredAt = body.measuredAt === undefined
          ? null
          : typeof body.measuredAt === 'string' ? Date.parse(body.measuredAt) : Number.NaN
        if (!Number.isSafeInteger(originalId) || originalId < 1 ||
          value === null || Math.abs(value) >= 1e100 ||
          unit.length < 1 || unit.length > 40 || hasControlCharacter(unit) ||
          justification.length < 10 || justification.length > 2000 ||
          (measuredAt !== null && (!Number.isFinite(measuredAt) || measuredAt > Date.now()))) {
          return error(response, 400, 'informe valor, unidade, justificativa e horário de medição válidos.')
        }
        const corrected = await db.transaction(async (client) => {
          const originalResult = await client.query(
            `SELECT id, unit_id, harvest_id, equipment_id, indicator_id, source_id,
               valor_original, unidade_original, valor_normalizado, unidade_normalizada,
               measured_at, attributes, corrects_measurement_id
             FROM measurements WHERE organization_id=$1 AND id=$2 FOR UPDATE`,
            [organizationId, originalId],
          )
          if (!originalResult.rowCount) return { error: 'not_found' }
          const original = originalResult.rows[0]
          if (original.corrects_measurement_id !== null) return { error: 'not_original' }
          if (!original.unit_id || !hasUnitScope(accessContext, original.unit_id)) return { error: 'forbidden' }
          const versionResult = await client.query(
            `SELECT COALESCE(max(correction_version),0)::integer AS version
             FROM measurements
             WHERE organization_id=$1 AND corrects_measurement_id=$2`,
            [organizationId, originalId],
          )
          const correctionVersion = Number(versionResult.rows[0].version) + 1
          const timestamp = nowIso()
          const effectiveMeasuredAt = measuredAt === null ? original.measured_at : new Date(measuredAt).toISOString()
          const inserted = await client.query(
            `INSERT INTO measurements
               (organization_id, harvest_id, equipment_id, unit_id, indicator_id, source_id,
                valor_original, unidade_original, valor_normalizado, unidade_normalizada,
                regra_aplicada, versao_processamento, responsavel_ou_processo,
                measured_at, received_at, processed_at, released_at, validation_status, attributes,
                measurement_mode, corrects_measurement_id, correction_version, correction_justification)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,'correction',$10,$11,$12,$13,$13,$13,
                'pending',$14::jsonb,'manual',$15,$16,$17)
             RETURNING id, measured_at, received_at`,
            [
              organizationId, original.harvest_id, original.equipment_id, original.unit_id, original.indicator_id,
              original.source_id, String(body.value), unit, value, `correction-v${correctionVersion}`,
              authenticated.id, effectiveMeasuredAt, timestamp, JSON.stringify({
                correctionOf: originalId,
                correctionVersion,
                previousValue: original.valor_original,
                previousUnit: original.unidade_original,
              }),
              originalId, correctionVersion, justification,
            ],
          )
          const period = await client.query(
            `SELECT starts_on, ends_on FROM harvests
             WHERE organization_id=$1 AND id=$2`,
            [organizationId, original.harvest_id],
          )
          const periodStart = period.rows[0]?.starts_on || new Date(original.measured_at).toISOString().slice(0, 10)
          const periodEnd = period.rows[0]?.ends_on || new Date(original.measured_at).toISOString().slice(0, 10)
          await client.query(
            `INSERT INTO metric_recalculation_events
               (organization_id, unit_id, source_measurement_id, indicator_id, harvest_id,
                period_start, period_end, requested_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              organizationId, original.unit_id, Number(inserted.rows[0].id), original.indicator_id,
              original.harvest_id, periodStart, periodEnd, authenticated.id,
            ],
          )
          await appendAuditLog(client, {
            organizationId, unitId: original.unit_id, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'measurement_corrected',
            entityType: 'measurement', entityId: inserted.rows[0].id, justification,
            beforeData: {
              measurementId: originalId,
              value: original.valor_original,
              unit: original.unidade_original,
            },
            afterData: {
              measurementId: Number(inserted.rows[0].id),
              value: String(body.value),
              unit,
              correctionVersion,
              recalculatePeriod: { start: periodStart, end: periodEnd },
            },
          })
          return {
            id: Number(inserted.rows[0].id),
            originalId,
            correctionVersion,
            unitId: Number(original.unit_id),
            harvestId: original.harvest_id === null ? null : Number(original.harvest_id),
            indicatorId: Number(original.indicator_id),
            value,
            unit,
            measuredAt: inserted.rows[0].measured_at,
            validationStatus: 'pending',
            recalculatePeriod: { start: periodStart, end: periodEnd },
          }
        }, accessContext)
        if (corrected.error === 'forbidden') return forbidden(response)
        if (corrected.error === 'not_found') return error(response, 404, 'medição original não encontrada.')
        if (corrected.error === 'not_original') return error(response, 409, 'correções devem apontar para a medição original, não para outra versão.')
        return json(response, 201, corrected)
      }
      if (pathname === '/api/metrics' && request.method === 'GET') {
        if (!hasPermission(accessContext, 'analytics', 'can_read')) return forbidden(response)
        const catalog = await db.query(
          `SELECT m.code, m.name, m.category, m.unit, m.granularity, m.aggregation_rule AS "aggregationRule",
             required_fields AS "requiredFields", minimum_value AS "minimumValue",
             maximum_value AS "maximumValue", tolerance, target_value AS target,
             desirable_direction AS "desirableDirection", technical_source AS "technicalSource",
             formula, valid_from AS "validFrom", valid_to AS "validTo", rule_version AS version,
             status, homologated_by AS "homologatedBy", homologated_at AS "homologatedAt",
             u.name AS "homologatorName"
           FROM metric_definitions m
           LEFT JOIN users u ON u.organization_id=m.organization_id AND u.id=m.homologated_by
           WHERE m.organization_id=$1
           ORDER BY m.category, m.code, m.valid_from DESC, m.rule_version DESC`,
          [organizationId], organizationId,
        )
        return json(response, 200, catalog.rows)
      }
      const lineageMatch = pathname.match(/^\/api\/metrics\/([A-Z][A-Z0-9_]{1,79})\/lineage$/)
      if (lineageMatch && request.method === 'GET') {
        if (!hasPermission(accessContext, 'analytics', 'can_read')) return forbidden(response)
        const code = lineageMatch[1]
        const datePattern = /^\d{4}-\d{2}-\d{2}$/
        const today = new Date().toISOString().slice(0, 10)
        const startDate = url.searchParams.get('start') || today
        const endDate = url.searchParams.get('end') || today
        const validDate = (value) => datePattern.test(value) &&
          !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
        if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
          return error(response, 400, 'informe um período válido usando start e end no formato YYYY-MM-DD.')
        }
        const definitionResult = await db.query(
          `SELECT m.code, m.name, m.category, m.unit, m.granularity, m.aggregation_rule, m.required_fields,
             source_aliases, minimum_value, maximum_value, tolerance, target_value,
             desirable_direction, technical_source, formula, critical_delay_minutes,
             valid_from, valid_to, rule_version, status, homologated_by, homologated_at,
             u.name AS homologator_name
           FROM metric_definitions m
           LEFT JOIN users u ON u.organization_id=m.organization_id AND u.id=m.homologated_by
           WHERE m.organization_id=$1 AND m.code=$2
             AND m.valid_from <= $3::date AND (m.valid_to IS NULL OR m.valid_to >= $4::date)
           ORDER BY m.valid_from DESC, m.rule_version DESC LIMIT 1`,
          [organizationId, code, startDate, endDate], organizationId,
        )
        const definition = definitionResult.rows[0]
        const lineage = {
          code,
          status: 'blocked',
          definition: definition || null,
          formulaApplied: definition?.formula || null,
          version: definition?.rule_version || null,
          period: { start: startDate, end: endDate },
          includedRecordCount: 0,
          excludedRecordCount: 0,
          totalRecordCount: 0,
          recordsIncluded: [],
          recordsExcluded: [],
          coverage: { samplesPercent: null, tonnesPercent: null },
          limitations: [],
          homologationResponsible: definition?.homologated_by
            ? {
                userId: definition.homologated_by,
                name: definition.homologator_name,
                homologatedAt: definition.homologated_at,
              }
            : null,
          blockers: [],
          value: null,
        }
        if (!definition || definition.status !== 'homologated') {
          lineage.blockers.push({
            code: 'formula_not_homologated',
            message: 'Não existe fórmula homologada e vigente para este indicador e período.',
          })
          lineage.limitations.push('Cadastre e homologue uma versão da regra antes de calcular o indicador.')
          return json(response, 200, lineage)
        }

        const endExclusive = new Date(`${endDate}T00:00:00Z`)
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
        if (code === 'LOAD_COUNT' || code === 'RECEIVED_TONNES') {
          const loads = await db.query(
            `SELECT id, external_reference, net_weight, weight_unit, weighed_at
             FROM loads
             WHERE organization_id=$1 AND weighed_at >= $2::timestamptz AND weighed_at < $3::timestamptz
             ORDER BY id`,
            [organizationId, `${startDate}T00:00:00.000Z`, endExclusive.toISOString()], organizationId,
          )
          if (code === 'LOAD_COUNT') {
            const eligible = loads.rows.filter((row) => row.external_reference)
            lineage.recordsIncluded = eligible.map((row) => ({
              loadId: Number(row.id),
              externalReference: row.external_reference,
              weighedAt: row.weighed_at,
            }))
            lineage.recordsExcluded = loads.rows
              .filter((row) => !row.external_reference)
              .map((row) => ({ loadId: Number(row.id), reasonCode: 'missing_load_reference' }))
            if (lineage.recordsExcluded.length) {
              lineage.blockers.push({
                code: 'missing_load_reference',
                message: 'Há pesagens sem referência de carga no período.',
              })
            }
            lineage.includedRecordCount = eligible.length
            lineage.value = eligible.length || null
            lineage.formulaApplied = 'COUNT(cargas com referência externa única)'
            lineage.coverage.tonnesPercent = null
            if (!eligible.length) {
              lineage.blockers.push({ code: 'no_valid_records', message: 'Não há cargas válidas no período informado.' })
            }
          } else {
            let totalKnownTonnes = 0
            const eligible = []
            for (const row of loads.rows) {
              if (!row.external_reference) {
                lineage.recordsExcluded.push({
                  loadId: Number(row.id),
                  reasonCode: 'missing_load_reference',
                  message: 'A pesagem não possui referência de carga.',
                })
                lineage.blockers.push({
                  code: 'missing_load_reference',
                  message: 'Há pesagens sem referência de carga no período.',
                })
                continue
              }
              const tonnes = normalizeTonnes(row.net_weight, row.weight_unit)
              if (tonnes === null) {
                lineage.recordsExcluded.push({
                  loadId: Number(row.id),
                  reasonCode: 'tonnage_unit_unknown',
                  message: 'Peso líquido ausente ou sem unidade reconhecida (kg ou t).',
                })
                lineage.blockers.push({
                  code: 'tonnage_unit_unknown',
                  message: 'Há cargas sem peso líquido em unidade reconhecida no período.',
                })
                continue
              }
              totalKnownTonnes += tonnes
              eligible.push({
                loadId: Number(row.id),
                externalReference: row.external_reference,
                netWeight: Number(row.net_weight),
                weightUnit: row.weight_unit,
                tonnes,
              })
            }
            lineage.recordsIncluded = eligible
            lineage.includedRecordCount = eligible.length
            lineage.coverage.tonnesPercent = totalKnownTonnes > 0 ? 100 : null
            lineage.value = eligible.reduce((sum, row) => sum + row.tonnes, 0) || null
            lineage.formulaApplied = 'SUM(peso líquido convertido para toneladas)'
            if (!eligible.length && !lineage.blockers.length) {
              lineage.blockers.push({ code: 'no_valid_records', message: 'Não há pesagens válidas no período informado.' })
            }
          }
          lineage.limitations.push('Pesos só são convertidos quando a unidade da carga está explicitamente informada como kg ou tonelada.')
          if (!lineage.blockers.length) lineage.status = 'calculated'
          else lineage.value = null
        } else if (code === 'TCH' || code === 'HARVESTED_AREA_HA') {
          const production = await db.query(
            `SELECT DISTINCT ON (harvest_id, plot_id)
               id, harvest_id, plot_id, version, harvested_tonnes, harvested_hectares, harvested_at
             FROM harvest_production_records
             WHERE organization_id=$1 AND harvested_at >= $2::date AND harvested_at <= $3::date
             ORDER BY harvest_id, plot_id, version DESC`,
            [organizationId, startDate, endDate], organizationId,
          )
          const records = production.rows.map((row) => ({
            id: Number(row.id),
            harvestId: Number(row.harvest_id),
            plotId: Number(row.plot_id),
            version: row.version,
            harvestedTonnes: Number(row.harvested_tonnes),
            harvestedHectares: Number(row.harvested_hectares),
            harvestedAt: row.harvested_at,
          }))
          if (code === 'TCH') {
            const calculation = calculateTch(records)
            lineage.formulaApplied = 'SUM(Toneladas_Colhidas) / SUM(Hectares_Colhidos), agrupado por safra e talhão compatíveis'
            if (calculation.reason) {
              lineage.blockers.push({
                code: calculation.reason === 'incompatible_harvest_area'
                  ? 'incompatible_harvest_area'
                  : 'missing_compatible_production_area',
                message: calculation.reason === 'incompatible_harvest_area'
                  ? 'Foram informadas áreas colhidas divergentes para o mesmo talhão e safra.'
                  : 'Não há produção e área colhida compatíveis no período.',
              })
              lineage.recordsExcluded = records.map((row) => ({
                productionRecordId: row.id,
                plotId: row.plotId,
                harvestId: row.harvestId,
                reasonCode: calculation.reason,
              }))
            } else {
              lineage.value = calculation.value
              lineage.recordsIncluded = calculation.included.map((row) => ({
                productionRecordId: row.id,
                version: row.version,
                harvestId: row.harvestId,
                plotId: row.plotId,
                harvestedTonnes: row.harvestedTonnes,
                harvestedHectares: row.harvestedHectares,
                harvestedAt: row.harvestedAt,
              }))
              lineage.includedRecordCount = lineage.recordsIncluded.length
              lineage.status = 'calculated'
            }
          } else {
            lineage.formulaApplied = 'SUM(Hectares_Colhidos), uma última versão por talhão e safra'
            if (!records.length) {
              lineage.blockers.push({ code: 'no_valid_records', message: 'Não há áreas colhidas conciliadas no período.' })
            } else {
              lineage.recordsIncluded = records.map((row) => ({
                productionRecordId: row.id,
                version: row.version,
                harvestId: row.harvestId,
                plotId: row.plotId,
                harvestedHectares: row.harvestedHectares,
                harvestedAt: row.harvestedAt,
              }))
              lineage.includedRecordCount = lineage.recordsIncluded.length
              lineage.value = records.reduce((sum, row) => sum + row.harvestedHectares, 0)
              lineage.status = 'calculated'
            }
          }
          lineage.limitations.push('Produção e área colhida são versionadas por talhão e safra; somente a última versão vigente de cada par entra no cálculo.')
        } else if (definition.category === 'quality' && definition.aggregation_rule === 'weighted_average' ||
          code === 'ATR_TONNES') {
          const aliases = Array.isArray(definition.source_aliases) ? definition.source_aliases : []
          const indicators = aliases.length
            ? await db.query(
              'SELECT id FROM indicator_definitions WHERE organization_id=$1 AND lower(name)=ANY($2::text[])',
              [organizationId, aliases.map((alias) => String(alias).toLowerCase())], organizationId,
            )
            : { rows: [] }
          const indicatorIds = indicators.rows.map((row) => row.id)
          if (!indicatorIds.length) {
            lineage.blockers.push({
              code: 'source_indicator_not_configured',
              message: 'Nenhum indicador de análise de ATR está associado aos nomes de origem homologados.',
            })
            lineage.limitations.push('Cadastre o indicador de ATR no catálogo operacional com um nome de origem reconhecido.')
            return json(response, 200, lineage)
          }
          const samples = await db.query(
            `SELECT s.id AS sample_id, s.sample_code, s.sampled_at, s.load_id AS sample_load_id,
               q.id AS analysis_id, q.valor_normalizado, q.unidade_normalizada,
               q.validation_status, q.measured_at,
               q.received_at, l.id AS confirmed_load_id, l.net_weight, l.weight_unit
             FROM samples s
             LEFT JOIN quality_analyses q
               ON q.organization_id=s.organization_id AND q.sample_id=s.id
               AND q.indicator_id=ANY($4::bigint[])
             LEFT JOIN loads l ON l.organization_id=s.organization_id AND l.id=s.load_id
             WHERE s.organization_id=$1
               AND COALESCE(s.sampled_at, q.measured_at) >= $2::timestamptz
               AND COALESCE(s.sampled_at, q.measured_at) < $3::timestamptz
             ORDER BY s.id, q.id`,
            [organizationId, `${startDate}T00:00:00.000Z`, endExclusive.toISOString(), indicatorIds], organizationId,
          )
          const grouped = new Map()
          for (const row of samples.rows) {
            const sample = grouped.get(String(row.sample_id)) || { rows: [], sample: row }
            sample.rows.push(row)
            grouped.set(String(row.sample_id), sample)
          }
          const candidates = []
          let knownTonnage = 0
          for (const { rows, sample } of grouped.values()) {
            const exclusion = (reasonCode, message) => lineage.recordsExcluded.push({
              sampleId: Number(sample.sample_id),
              sampleCode: sample.sample_code,
              loadId: sample.sample_load_id === null ? null : Number(sample.sample_load_id),
              analysisIds: rows.filter((row) => row.analysis_id).map((row) => Number(row.analysis_id)),
              reasonCode,
              message,
            })
            const sampleTonnes = normalizeTonnes(sample.net_weight, sample.weight_unit)
            if (sample.confirmed_load_id && sampleTonnes !== null) knownTonnage += sampleTonnes
            if (!sample.sample_load_id || !sample.confirmed_load_id) {
              exclusion('tonnage_not_associated', 'A amostra não possui vínculo confirmado com uma carga.')
              lineage.blockers.push({
                code: 'tonnage_not_associated',
                message: 'Há amostras sem vínculo confirmado com uma carga no período.',
              })
              continue
            }
            if (rows.length !== 1 || !rows[0].analysis_id) {
              const duplicate = rows.length > 1
              const reasonCode = duplicate ? 'duplicate_atr_analyses' : 'pending_sample'
              const message = duplicate
                ? 'Mais de uma análise de ATR corresponde à amostra.'
                : 'A amostra ainda não possui análise de ATR.'
              exclusion(reasonCode, message)
              lineage.blockers.push({
                code: duplicate ? 'duplicate_atr_analyses' : 'pending_samples',
                message: duplicate ? 'Há amostras com múltiplas análises de ATR.' : 'Há amostras pendentes no período.',
              })
              continue
            }
            const row = rows[0]
            const tonnes = sampleTonnes
            let reasonCode = ''
            let reasonMessage = ''
            if (!row.sample_load_id || !row.confirmed_load_id) {
              reasonCode = 'tonnage_not_associated'
              reasonMessage = 'A amostra não possui vínculo confirmado com uma carga.'
            } else if (tonnes === null) {
              reasonCode = 'tonnage_unit_unknown'
              reasonMessage = 'A carga não possui tonelagem positiva em unidade reconhecida (kg ou t).'
            } else if (row.validation_status !== 'valid') {
              reasonCode = row.validation_status === 'pending' ? 'pending_sample' : 'invalid_analysis'
              reasonMessage = `A análise não está liberada para cálculo (status: ${row.validation_status}).`
            } else if (!isCompatibleMetricUnit(code, row.unidade_normalizada)) {
              reasonCode = 'unit_mismatch'
              reasonMessage = 'A unidade normalizada da análise não corresponde à unidade homologada do indicador.'
            } else if (row.valor_normalizado === null || row.valor_normalizado === undefined ||
              !Number.isFinite(Number(row.valor_normalizado))) {
              reasonCode = 'missing_atr_value'
              reasonMessage = 'O valor normalizado de ATR está ausente.'
            } else if (Date.parse(row.received_at) - Date.parse(row.measured_at) >
              Number(definition.critical_delay_minutes) * 60_000) {
              reasonCode = 'critical_data_delay'
              reasonMessage = 'O atraso entre medição e recebimento excede o limite homologado.'
            }
            if (reasonCode) {
              exclusion(reasonCode, reasonMessage)
              if (['tonnage_not_associated', 'tonnage_unit_unknown', 'pending_sample', 'critical_data_delay', 'unit_mismatch'].includes(reasonCode)) {
                lineage.blockers.push({ code: reasonCode, message: reasonMessage })
              }
              continue
            }
            candidates.push({
              sampleId: Number(sample.sample_id),
              sampleCode: sample.sample_code,
              analysisId: Number(row.analysis_id),
              loadId: Number(row.confirmed_load_id),
              value: Number(row.valor_normalizado),
              unit: row.unidade_normalizada,
              measuredAt: row.measured_at,
              tonnes,
            })
          }
          const calculation = code === 'ATR_TONNES'
            ? calculateAtrTonnes(candidates)
            : calculateWeightedAverage(candidates)
          lineage.recordsIncluded = calculation.included?.map((row) => ({
            sampleId: row.sampleId,
            sampleCode: row.sampleCode,
            analysisId: row.analysisId,
            loadId: row.loadId,
            value: row.value,
            unit: row.unit,
            measuredAt: row.measuredAt,
            tonnes: row.tonnes,
          })) || []
          lineage.includedRecordCount = lineage.recordsIncluded.length
          lineage.coverage.samplesPercent = grouped.size
            ? (lineage.includedRecordCount / grouped.size) * 100
            : null
          const includedTonnes = candidates.reduce((sum, row) => sum + row.tonnes, 0)
          lineage.coverage.tonnesPercent = knownTonnage > 0 ? (includedTonnes / knownTonnage) * 100 : null
          lineage.formulaApplied = code === 'ATR_TONNES'
            ? 'SUM(ATR_i * Toneladas_i) / 1000'
            : 'SUM(Indicador_i * Toneladas_i) / SUM(Toneladas_i)'
          lineage.limitations.push('Somente análises válidas vinculadas a amostra e carga com peso líquido e unidade conhecidos entram no cálculo.')
          lineage.limitations.push('A cobertura de toneladas considera pesos conhecidos; cargas sem unidade reconhecida são excluídas e bloqueiam o cálculo.')
          if (!candidates.length && !lineage.blockers.length) {
            lineage.blockers.push({ code: 'no_valid_records', message: 'Não há registros válidos para o período informado.' })
          }
          if (!lineage.blockers.length) {
            lineage.status = 'calculated'
            lineage.value = calculation.value
          }
        } else {
          lineage.blockers.push({
            code: 'source_data_unavailable',
            message: 'O catálogo possui a regra, mas as fontes operacionais necessárias ainda não estão conciliadas para este indicador.',
          })
          lineage.limitations.push('Nenhuma ausência de dado é convertida em zero ou substituída por média simples.')
        }
        lineage.blockers = [...new Map(lineage.blockers.map((blocker) => [blocker.code, blocker])).values()]
        lineage.excludedRecordCount = lineage.recordsExcluded.length
        lineage.totalRecordCount = lineage.includedRecordCount + lineage.excludedRecordCount
        return json(response, 200, lineage)
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
        const stateType = entityType === 'measurements' ? 'measurement' : 'quality_analysis'
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
          await client.query(
            `INSERT INTO record_states
               (organization_id, entity_type, entity_id, unit_id, release_status, updated_by)
             VALUES ($1,$2,$3,$4,'normal',$5)
             ON CONFLICT (organization_id, entity_type, entity_id) DO UPDATE SET
               release_status='normal', updated_by=EXCLUDED.updated_by, updated_at=now()`,
            [organizationId, stateType, id, unitId, authenticated.id],
          )
          await appendAuditLog(client, {
            organizationId, unitId, actorUserId: authenticated.id,
            requestId: request.headers['x-request-id'], eventType: 'record_released',
            entityType: stateType, entityId: id, justification,
            afterData: { releaseStatus: 'normal', approvedBy: authenticated.id },
          })
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
