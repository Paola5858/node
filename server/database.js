import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'
import pg from 'pg'

const migrationDirectory = fileURLToPath(new URL('./migrations/', import.meta.url))
const environments = new Set(['DEV', 'QAS', 'PRD'])
const requestSecurityContext = new AsyncLocalStorage()

export function withSecurityContext(context, callback) {
  return requestSecurityContext.run(context, callback)
}

function effectiveContext(organizationId) {
  if (typeof organizationId === 'object' && organizationId !== null) return organizationId
  const active = requestSecurityContext.getStore()
  if (active?.organizationId && active.organizationId !== organizationId) {
    throw new Error('O contexto organizacional não corresponde à consulta.')
  }
  return active?.organizationId === organizationId
    ? active
    : { organizationId, allowedUnitIds: [], permissionCodes: [], userId: '', accessLevel: '' }
}

async function applySecurityContext(client, context) {
  const settings = [
    ['app.current_org_id', context.organizationId || ''],
    ['app.current_user_id', context.userId || ''],
    ['app.allowed_units', (context.allowedUnitIds || []).join(',')],
    ['app.allowed_fronts', (context.allowedFrontIds || []).join(',')],
    ['app.permission_codes', (context.permissionCodes || []).join(',')],
    ['app.access_level', context.accessLevel || ''],
    ['app.department', context.department || ''],
  ]
  for (const [name, value] of settings) {
    await client.query('SELECT set_config($1, $2, true)', [name, value])
  }
}

export function createDatabase({ environment = process.env.APP_ENV || 'DEV', connectionString } = {}) {
  if (!environments.has(environment)) throw new Error('APP_ENV deve ser DEV, QAS ou PRD.')
  const resolvedConnectionString = connectionString || process.env[`DATABASE_URL_${environment}`]
  if (!resolvedConnectionString) throw new Error(`DATABASE_URL_${environment} não foi configurada.`)
  if (environment === 'PRD' && process.env.ALLOW_PRD_DATABASE !== 'true') {
    throw new Error('Conexões PRD exigem ALLOW_PRD_DATABASE=true explícito.')
  }
  const pool = new pg.Pool({
    connectionString: resolvedConnectionString,
    max: Number(process.env.DATABASE_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    options: '-c search_path=operational,analytics,raw,public',
    application_name: `cana-intelligence-${environment.toLowerCase()}`,
  })

  return {
    environment,
    async query(text, values = [], organizationId) {
      if (!organizationId) return pool.query(text, values)
      const context = effectiveContext(organizationId)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await applySecurityContext(client, context)
        const result = await client.query(text, values)
        await client.query('COMMIT')
        return result
      } catch (cause) {
        await client.query('ROLLBACK')
        throw cause
      } finally {
        client.release()
      }
    },
    async transaction(callback, organizationId) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        if (organizationId) await applySecurityContext(client, effectiveContext(organizationId))
        const result = await callback(client)
        await client.query('COMMIT')
        return result
      } catch (cause) {
        await client.query('ROLLBACK')
        throw cause
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export async function migrateDatabase(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const files = (await readdir(migrationDirectory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()
  for (const file of files) {
    const version = file.slice(0, file.indexOf('_'))
    const sql = await readFile(join(migrationDirectory, file), 'utf8')
    await db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('cana-intelligence-migrations'))")
      const alreadyApplied = await client.query('SELECT 1 FROM public.schema_migrations WHERE version = $1', [version])
      if (alreadyApplied.rowCount) return
      await client.query(sql)
      await client.query('INSERT INTO public.schema_migrations (version) VALUES ($1)', [version])
    })
  }
}
