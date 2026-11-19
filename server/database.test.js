import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createDatabase, migrateDatabase } from './database.js'

const migrationUrl = new URL('./migrations/001_relational_analytics.sql', import.meta.url)
const authorizationMigrationUrl = new URL('./migrations/002_rbac_unit_rls.sql', import.meta.url)
const importPipelineMigrationUrl = new URL('./migrations/003_controlled_import_pipeline.sql', import.meta.url)
const importTargetsMigrationUrl = new URL('./migrations/004_multi_entity_import_targets.sql', import.meta.url)
const versionedMetricsMigrationUrl = new URL('./migrations/005_versioned_metrics.sql', import.meta.url)
const operationalWorkflowMigrationUrl = new URL('./migrations/006_operational_traceability_workflow.sql', import.meta.url)

test('database selection requires a named, isolated environment', () => {
  assert.throws(() => createDatabase({ environment: 'LOCAL', connectionString: 'postgres://localhost/db' }), /APP_ENV/)
  assert.throws(() => createDatabase({ environment: 'QAS', connectionString: '' }), /DATABASE_URL_QAS/)
  assert.throws(() => createDatabase({ environment: 'PRD', connectionString: 'postgres://localhost/db' }), /ALLOW_PRD_DATABASE/)
})

test('relational migration includes operational entities, star facts and tenant RLS', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const required = [
    'organizations', 'units', 'harvests', 'departments', 'roles', 'permissions', 'suppliers', 'farms',
    'plots', 'fronts', 'loads', 'samples', 'quality_analyses', 'measurements', 'equipment',
    'analytical_methods', 'indicator_definitions', 'technical_rules', 'versioned_targets', 'sources',
    'import_batches', 'raw_import_rows', 'validation_errors', 'occurrences', 'actions', 'audit_events', 'closure_versions',
    'fact_loads_weighing', 'fact_samples_analyses', 'fact_industrial_measurements', 'fact_events_stoppages',
    'fact_imports_quality', 'fact_occurrences', 'dim_date', 'dim_org', 'dim_unit', 'dim_harvest',
    'dim_indicator', 'dim_source', 'dim_supplier', 'dim_farm', 'dim_plot', 'dim_front',
    'dim_equipment', 'dim_method', 'dim_validation_status',
  ]
  for (const table of required) assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`))
  assert.doesNotMatch(sql, /CREATE TABLE records\s*\(/)
  assert.match(sql, /FOREIGN KEY \(organization_id, harvest_id\) REFERENCES harvests\(organization_id, id\) ON DELETE RESTRICT/)
  assert.match(sql, /CREATE TRIGGER raw_import_rows_are_immutable/)
  assert.match(sql, /ALTER TABLE %I ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /current_setting\(''app\.organization_id'', true\)/)
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS raw/)
  assert.match(sql, /ALTER TABLE public\.%I SET SCHEMA analytics/)

  for (const table of ['measurements', 'quality_analyses']) {
    const definition = sql.match(new RegExp(`CREATE TABLE ${table} \\(([\\s\\S]*?)\\n\\);`))?.[1]
    assert.ok(definition, `${table} table definition exists`)
    for (const column of ['valor_original', 'unidade_original', 'valor_normalizado', 'unidade_normalizada', 'regra_aplicada', 'versao_processamento', 'responsavel_ou_processo', 'measured_at', 'received_at', 'processed_at', 'released_at']) {
      assert.match(definition, new RegExp(`\\b${column}\\b`), `${table}.${column} exists`)
    }
    for (const marker of ['measured_at', 'received_at', 'processed_at', 'released_at']) {
      assert.match(definition, new RegExp(`${marker} timestamptz NOT NULL`), `${table}.${marker} is mandatory`)
    }
  }
  assert.match(sql, /CREATE TRIGGER measurements_are_immutable/)
  assert.match(sql, /CREATE TRIGGER quality_analyses_are_immutable/)
})

test('authorization migration adds unit/front RLS, RBAC permissions and privileged-action controls', async () => {
  const sql = await readFile(authorizationMigrationUrl, 'utf8')
  for (const setting of ['app.current_org_id', 'app.allowed_units', 'app.allowed_fronts', 'app.permission_codes', 'app.access_level', 'app.department']) {
    assert.ok(sql.includes(setting), `${setting} is consumed by the migration`)
  }
  for (const table of ['user_unit_scope', 'user_front_scope', 'release_approvals']) {
    assert.match(sql, new RegExp(`CREATE TABLE operational\\.${table} \\(`))
  }
  assert.match(sql, /CREATE POLICY rbac_select .* AS RESTRICTIVE FOR SELECT/)
  assert.match(sql, /release_approval_insert .*can_approve_release/)
  assert.match(sql, /closure_insert .*app\.access_level/)
  assert.match(sql, /technical_rules_are_versioned/)
  assert.match(sql, /versioned_targets_no_delete/)
  assert.match(sql, /app_front_allowed\(front_id\)/)
  assert.match(sql, /CREATE POLICY audit_events_no_delete/)
})

test('controlled import migration versions files, templates, queues and immutable classifications', async () => {
  const sql = await readFile(importPipelineMigrationUrl, 'utf8')
  assert.match(sql, /import_batches_hash_version_unique/)
  assert.match(sql, /reprocess_of/)
  assert.match(sql, /CREATE TABLE raw\.import_mapping_templates/)
  assert.match(sql, /CREATE TABLE raw\.import_jobs/)
  assert.match(sql, /ALTER TABLE analytics\.fact_imports_quality/)
  assert.match(sql, /import_batches_confirmed_by_fk/)
  assert.match(sql, /row_queue IN \('Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes'\)/)
  assert.match(sql, /technical_rules_valid_range/)
  assert.match(sql, /CREATE POLICY homologate_rules_only ON operational\.technical_rules AS RESTRICTIVE FOR UPDATE[\s\S]*?current_setting\('app\.access_level', true\) IN \('tactical', 'strategic'\)/)
  assert.match(sql, /CREATE POLICY technical_rules_draft_insert ON operational\.technical_rules AS RESTRICTIVE FOR INSERT[\s\S]*?current_setting\('app\.access_level', true\) IN \('tactical', 'strategic'\)/)
  assert.match(sql, /measurements_import_row_unique/)
  assert.match(sql, /public\.app_rbac_allowed\('imports', 'can_write'\)/)
})

test('multi-entity import migration versions measurements, loads and quality analyses', async () => {
  const sql = await readFile(importTargetsMigrationUrl, 'utf8')
  assert.match(sql, /entity_type IN \('measurements', 'loads', 'quality_analyses'\)/)
  assert.match(sql, /CREATE UNIQUE INDEX import_batches_hash_version_unique[\s\S]*entity_type/)
  assert.match(sql, /import_mapping_templates_entity_name_unique/)
  assert.match(sql, /loads_import_row_unique/)
  assert.match(sql, /loads_external_reference_unique/)
  assert.match(sql, /quality_analyses_import_row_unique/)
})

test('versioned metrics migration persists homologation, provenance and explicit load weight units', async () => {
  const sql = await readFile(versionedMetricsMigrationUrl, 'utf8')
  assert.match(sql, /CREATE TABLE operational\.metric_definitions/)
  for (const field of [
    'code', 'unit', 'granularity', 'aggregation_rule', 'required_fields',
    'minimum_value', 'maximum_value', 'tolerance', 'target_value',
    'desirable_direction', 'technical_source', 'valid_from', 'rule_version',
    'homologated_by', 'homologated_at',
  ]) assert.match(sql, new RegExp(`\\b${field}\\b`))
  assert.match(sql, /metric_definitions_are_versioned/)
  assert.match(sql, /ADD COLUMN weight_unit/)
  assert.match(sql, /public\.app_rbac_allowed\('analytics', 'can_read'\)/)
  assert.match(sql, /CREATE TABLE operational\.harvest_production_records/)
  assert.match(sql, /harvest_production_records_are_immutable/)
  assert.match(sql, /harvest_production_insert/)
})

test('operational workflow migration adds traceability, independent states and append-only audit', async () => {
  const sql = await readFile(operationalWorkflowMigrationUrl, 'utf8')
  for (const table of [
    'load_weighings', 'equipment_calibrations', 'record_states', 'occurrence_evidence',
    'occurrence_workflow_events', 'occurrence_verifications', 'audit_logs',
    'metric_recalculation_events',
  ]) assert.match(sql, new RegExp(`CREATE TABLE operational\\.${table} \\(`))
  for (const state of [
    'operational_condition', 'data_condition', 'attention_priority', 'investigation_status',
    'release_status', 'origin_status',
  ]) assert.match(sql, new RegExp(`\\b${state}\\b`))
  for (const table of [
    'load_weighings', 'equipment_calibrations', 'occurrence_evidence',
    'occurrence_workflow_events', 'occurrence_verifications', 'audit_logs',
    'metric_recalculation_events',
  ]) assert.match(sql, new RegExp(`CREATE TRIGGER ${table}_are_immutable`))
  assert.match(sql, /CREATE FUNCTION operational\.prevent_append_only_mutation/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.app_department_allowed/)
  assert.match(sql, /BEFORE UPDATE OR DELETE ON operational\.audit_logs/)
  assert.match(sql, /corrects_measurement_id/)
  assert.match(sql, /correction_justification/)
  assert.match(sql, /public\.app_rbac_allowed\('occurrences', 'can_write'\)/)
})

test('versioned migrations run once and are wrapped in a transaction', async () => {
  const applied = new Set()
  const executed = []
  const db = {
    async query(sql) {
      executed.push(sql)
      return { rowCount: 0 }
    },
    async transaction(callback) {
      return callback({
        async query(sql, values = []) {
          if (sql.startsWith('SELECT 1 FROM public.schema_migrations')) return { rowCount: applied.has(values[0]) ? 1 : 0 }
          executed.push(sql)
          if (sql.startsWith('INSERT INTO public.schema_migrations')) applied.add(values[0])
          return { rowCount: 0 }
        },
      })
    },
  }

  await migrateDatabase(db)
  await migrateDatabase(db)
  assert.equal(executed.filter((sql) => sql.includes('CREATE TABLE organizations')).length, 1)
  assert.ok(applied.has('001'))
  assert.ok(applied.has('002'))
  assert.ok(applied.has('003'))
  assert.ok(applied.has('004'))
  assert.ok(applied.has('005'))
  assert.ok(applied.has('006'))
  assert.ok(executed.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS public.schema_migrations')))
  assert.ok(executed.some((sql) => sql.startsWith('INSERT INTO public.schema_migrations')))
})
