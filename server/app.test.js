import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createApiHandler } from './app.js'
import { createDatabase, migrateDatabase } from './database.js'

test('healthcheck does not query tenant data', async (t) => {
  const db = { query: () => { throw new Error('healthcheck must not query the database') } }
  const api = createApiHandler({ db })
  const server = createServer(async (request, response) => {
    const handled = await api(request, response)
    if (handled === false) response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
})

test('metric lineage returns a structured block when no homologated version exists', async (t) => {
  const db = {
    async query(sql) {
      if (sql.includes('FROM sessions s JOIN users u')) {
        return {
          rows: [{
            session_id: 'session',
            csrf_hash: '',
            expires_at: Date.now() + 60_000,
            id: 'user',
            organization_id: 'org',
            department: 'ti',
            access_level: 'strategic',
          }],
        }
      }
      if (sql.includes('FROM users u') && sql.includes('user_unit_scope')) {
        return {
          rowCount: 1,
          rows: [{
            department: 'ti',
            access_level: 'strategic',
            unit_ids: [],
            front_ids: [],
            permission_codes: ['analytics:can_read'],
            role_names: ['organization_admin'],
          }],
        }
      }
      if (sql.includes('FROM metric_definitions m')) return { rows: [] }
      throw new Error(`unexpected database query: ${sql}`)
    },
  }
  const api = createApiHandler({ db })
  const server = createServer(async (request, response) => {
    const handled = await api(request, response)
    if (handled === false) response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/metrics/ATR_WEIGHTED/lineage?start=2026-01-01&end=2026-01-31`,
    { headers: { Cookie: 'plume_session=token' } },
  )
  assert.equal(response.status, 200)
  const lineage = await response.json()
  assert.equal(lineage.status, 'blocked')
  assert.equal(lineage.value, null)
  assert.equal(lineage.period.start, '2026-01-01')
  assert.equal(lineage.blockers[0].code, 'formula_not_homologated')
})

test('PostgreSQL API isolates tenants, unit scopes, exports, attachments, and privileged actions', {
  skip: !process.env.DATABASE_URL_DEV && 'set DATABASE_URL_DEV to run PostgreSQL integration tests',
}, async (t) => {
  const db = createDatabase({ environment: 'DEV' })
  await migrateDatabase(db)
  const storedObjects = new Map()
  const api = createApiHandler({
    db,
    secureCookies: false,
    preserveOriginalFn: async ({ organizationId, contentType, bytes }) => {
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const key = `${organizationId}/originals/test-${sha256}`
      storedObjects.set(key, { bytes, contentType })
      return { key, sha256 }
    },
    retrieveOriginalFn: async ({ objectKey }) => {
      const object = storedObjects.get(objectKey)
      if (!object) throw Object.assign(new Error('arquivo original não encontrado.'), { status: 404 })
      return object
    },
  })
  const server = createServer(async (request, response) => {
    const handled = await api(request, response)
    if (handled === false) response.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await db.close()
  })
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  async function send(path, { method = 'GET', cookie = '', csrf = '', body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return response
  }
  async function register(email, organizationName) {
    const response = await send('/api/auth/register', {
      method: 'POST',
      body: { nome: 'Responsável', email, organizationName, senha: 'senha-de-teste-12' },
    })
    assert.equal(response.status, 201)
    const cookie = response.headers.getSetCookie().map((entry) => entry.split(';', 1)[0]).join('; ')
    const session = await send('/api/auth/session', { cookie })
    const sessionBody = await session.json()
    return { cookie, csrf: sessionBody.csrfToken, user: sessionBody.user }
  }
  async function login(email, password) {
    const response = await send('/api/auth/login', { method: 'POST', body: { email, senha: password } })
    assert.equal(response.status, 200)
    const cookie = response.headers.getSetCookie().map((entry) => entry.split(';', 1)[0]).join('; ')
    const session = await send('/api/auth/session', { cookie })
    return { cookie, csrf: (await session.json()).csrfToken }
  }

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const tenantA = await register(`a-${suffix}@example.test`, `Usina A ${suffix}`)
  const tenantB = await register(`b-${suffix}@example.test`, `Usina B ${suffix}`)
  const created = await send('/api/cadastros/unidade', {
    method: 'POST', cookie: tenantA.cookie, csrf: tenantA.csrf, body: { nome: 'Unidade isolada' },
  })
  assert.equal(created.status, 201)
  const unitId = (await created.json()).Id
  const otherUnitResponse = await send('/api/cadastros/unidade', {
    method: 'POST', cookie: tenantA.cookie, csrf: tenantA.csrf, body: { nome: 'Unidade restrita' },
  })
  assert.equal(otherUnitResponse.status, 201)
  const otherUnitId = (await otherUnitResponse.json()).Id
  const listB = await send('/api/cadastros/unidade', { cookie: tenantB.cookie })
  assert.deepEqual(await listB.json(), [])
  assert.equal((await send(`/api/cadastros/unidade/${unitId}`, { cookie: tenantB.cookie })).status, 404)
  assert.deepEqual(await (await send('/api/exports/unidade', { cookie: tenantB.cookie })).json(), [])

  const memberEmail = `operador-${suffix}@example.test`
  const memberPassword = 'senha-operacional-12'
  const memberCreated = await send('/api/admin/users', {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: {
      name: 'Operador',
      email: memberEmail,
      password: memberPassword,
      department: 'industrial',
      accessLevel: 'operational',
      roleName: 'operational',
      unitIds: [],
      frontIds: [],
    },
  })
  assert.equal(memberCreated.status, 201)
  const memberId = (await memberCreated.json()).id
  await db.query(
    `INSERT INTO role_permissions (organization_id, role_id, permission_id)
     SELECT $1,r.id,p.id FROM roles r JOIN permissions p ON p.organization_id=r.organization_id
     WHERE r.organization_id=$1 AND r.name='operational' AND p.module IN ('units','imports') AND p.action='can_export'
     ON CONFLICT DO NOTHING`,
    [tenantA.user.organizationId], tenantA.user.organizationId,
  )
  const member = await login(memberEmail, memberPassword)
  const accessUpdate = await send(`/api/admin/users/${memberId}/access`, {
    method: 'PATCH',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: {
      department: 'industrial',
      accessLevel: 'operational',
      roleName: 'operational',
      unitIds: [unitId],
      frontIds: [],
    },
  })
  assert.equal(accessUpdate.status, 200)
  const scopedUnits = await send('/api/cadastros/unidade', { cookie: member.cookie })
  assert.deepEqual((await scopedUnits.json()).map((unit) => unit.Id), [unitId])
  assert.equal((await send(`/api/cadastros/unidade/${otherUnitId}`, { cookie: member.cookie })).status, 404)
  const scopedExport = await send('/api/exports/unidade', { cookie: member.cookie })
  assert.deepEqual((await scopedExport.json()).map((unit) => unit.Id), [unitId])
  const deniedUserCreation = await send('/api/admin/users', {
    method: 'POST',
    cookie: member.cookie,
    csrf: member.csrf,
    body: {
      name: 'Outro operador',
      email: `outro-${suffix}@example.test`,
      password: 'senha-operacional-12',
      department: 'industrial',
      accessLevel: 'operational',
      roleName: 'operational',
      unitIds: [],
      frontIds: [],
    },
  })
  assert.equal(deniedUserCreation.status, 403)
  const deniedImport = await send('/api/imports', {
    method: 'POST',
    cookie: member.cookie,
    csrf: member.csrf,
    body: { fileName: 'fora-do-escopo.csv', contentType: 'text/csv', base64: 'QUJD', unitId: otherUnitId },
  })
  assert.equal(deniedImport.status, 403)
  assert.equal((await send('/api/rules/1/homologate', {
    method: 'POST', cookie: member.cookie, csrf: member.csrf, body: { justification: 'tentativa operacional' },
  })).status, 403)
  assert.equal((await send('/api/periods/1/close', {
    method: 'POST', cookie: member.cookie, csrf: member.csrf, body: {},
  })).status, 403)
  assert.equal((await send('/api/releases/measurements/1', {
    method: 'POST', cookie: member.cookie, csrf: member.csrf, body: { justification: 'tentativa operacional' },
  })).status, 403)
  assert.equal((await send('/api/rules', {
    method: 'POST',
    cookie: member.cookie,
    csrf: member.csrf,
    body: { indicatorId: 1, name: 'Faixa operacional', version: '1', minimumValue: 0, maximumValue: 25 },
  })).status, 403)

  const adminContext = {
    organizationId: tenantA.user.organizationId,
    userId: tenantA.user.id,
    allowedUnitIds: ['*'],
    allowedFrontIds: ['*'],
    permissionCodes: ['imports:can_read', 'imports:can_write', 'imports:can_export'],
    accessLevel: 'strategic',
    department: 'ti',
  }
  const brix = await db.query(
    `INSERT INTO indicator_definitions (organization_id, name, description)
     VALUES ($1,'BRIX','Indicador para testes de importação') RETURNING id`,
    [tenantA.user.organizationId],
    adminContext,
  )
  const draftRule = await send('/api/rules', {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: {
      indicatorId: Number(brix.rows[0].id),
      name: 'Faixa BRIX homologada',
      version: '1',
      minimumValue: 0,
      maximumValue: 22,
    },
  })
  assert.equal(draftRule.status, 201)
  const createdRule = await draftRule.json()
  assert.equal(createdRule.status, 'draft')
  const homologatedRule = await send(`/api/rules/${createdRule.id}/homologate`, {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: { justification: 'limites técnicos revisados' },
  })
  assert.equal(homologatedRule.status, 200)
  const harvest = await db.query(
    `INSERT INTO harvests (organization_id, name, starts_on, ends_on, unit_id)
     VALUES ($1,$2,'2026-01-01','2026-12-31',$3) RETURNING id`,
    [tenantA.user.organizationId, `Safra pipeline ${suffix}`, unitId],
    adminContext,
  )
  const csv = `DATA_HORA;EQUIPAMENTO;INDICADOR;VALOR;UNIDADE\n${new Date(Date.now() - 60_000).toISOString()};Equipamento pipeline;BRIX;19.5;°Bx`
  const fileBytes = Buffer.from(csv)
  const uploadBody = {
    fileName: 'medicoes-pipeline.csv',
    contentType: 'text/csv',
    base64: fileBytes.toString('base64'),
    unitId,
    harvestId: Number(harvest.rows[0].id),
    sourceName: `source-pipeline-${suffix}`,
  }
  const upload = await send('/api/imports', {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: uploadBody,
  })
  assert.equal(upload.status, 201)
  const uploaded = await upload.json()
  assert.equal(uploaded.status, 'uploaded')
  assert.equal(uploaded.version, 1)

  const preview = await send(`/api/imports/${uploaded.id}/preview`, {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: {},
  })
  assert.equal(preview.status, 200)
  const previewBody = await preview.json()
  assert.equal(previewBody.totalRows, 1)
  assert.equal(previewBody.suggestedMapping.indicator, 'INDICADOR')
  assert.equal((await send(`/api/imports/${uploaded.id}`, { cookie: tenantA.cookie })).status, 200)
  assert.equal((await db.query(
    'SELECT 1 FROM raw.import_jobs WHERE organization_id=$1 AND import_batch_id=$2',
    [tenantA.user.organizationId, uploaded.id],
    adminContext,
  )).rowCount, 0)

  const mapping = previewBody.suggestedMapping
  const confirmed = await send(`/api/imports/${uploaded.id}/confirm`, {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: { mapping, templateName: 'Template LIMS' },
  })
  assert.equal(confirmed.status, 202)
  assert.equal((await (await send(`/api/imports/${uploaded.id}`, { cookie: tenantA.cookie })).json()).status, 'queued')
  assert.equal((await db.query(
    'SELECT status FROM raw.import_jobs WHERE organization_id=$1 AND import_batch_id=$2',
    [tenantA.user.organizationId, uploaded.id],
    adminContext,
  )).rows[0].status, 'queued')
  const report = await send(`/api/imports/${uploaded.id}/report.csv`, { cookie: tenantA.cookie })
  assert.equal(report.status, 200)
  assert.match(report.headers.get('content-type'), /text\/csv/)
  const duplicateUpload = await send('/api/imports', {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: uploadBody,
  })
  assert.equal(duplicateUpload.status, 409)
  const duplicateDetails = await duplicateUpload.json()
  assert.equal(duplicateDetails.existingBatchId, uploaded.id)
  const reprocessedUpload = await send('/api/imports', {
    method: 'POST',
    cookie: tenantA.cookie,
    csrf: tenantA.csrf,
    body: { ...uploadBody, reprocessOf: uploaded.id },
  })
  assert.equal(reprocessedUpload.status, 201)
  assert.equal((await reprocessedUpload.json()).version, 2)
  assert.equal((await send(`/api/imports/${uploaded.id}`, { cookie: tenantB.cookie })).status, 404)
  assert.equal((await send(`/api/imports/${uploaded.id}/report.csv`, { cookie: tenantB.cookie })).status, 404)
  assert.equal((await send(`/api/imports/${uploaded.id}/rows?queue=Pendentes`, { cookie: tenantB.cookie })).status, 404)

  const source = await db.query(
    `INSERT INTO sources (organization_id, name, source_type, authorized_read_only)
     VALUES ($1,'integration-test','file',true) RETURNING id`,
    [tenantA.user.organizationId], adminContext,
  )
  const batch = await db.query(
    `INSERT INTO import_batches (organization_id, source_id, uploaded_by, unit_id, object_key, original_filename, content_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenantA.user.organizationId, source.rows[0].id, tenantA.user.id, otherUnitId,
      `${tenantA.user.organizationId}/originals/not-present`, 'cross-unit.csv', 'a'.repeat(64)],
    adminContext,
  )
  assert.equal((await send(`/api/imports/${batch.rows[0].id}/original`, { cookie: member.cookie })).status, 404)
  assert.equal((await send(`/api/imports/${batch.rows[0].id}/original`, { cookie: tenantB.cookie })).status, 404)
})
