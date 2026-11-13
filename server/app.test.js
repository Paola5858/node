import { test } from 'node:test'
import assert from 'node:assert/strict'
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

test('PostgreSQL API isolates tenants, unit scopes, exports, attachments, and privileged actions', {
  skip: !process.env.DATABASE_URL_DEV && 'set DATABASE_URL_DEV to run PostgreSQL integration tests',
}, async (t) => {
  const db = createDatabase({ environment: 'DEV' })
  await migrateDatabase(db)
  const api = createApiHandler({ db, secureCookies: false })
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

  const adminContext = {
    organizationId: tenantA.user.organizationId,
    userId: tenantA.user.id,
    allowedUnitIds: ['*'],
    allowedFrontIds: ['*'],
    permissionCodes: ['imports:can_read', 'imports:can_write', 'imports:can_export'],
    accessLevel: 'strategic',
    department: 'ti',
  }
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
