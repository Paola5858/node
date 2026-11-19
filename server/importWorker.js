import { withSecurityContext } from './database.js'
import { retrieveOriginal } from './objectStorage.js'
import {
  IMPORT_QUEUES,
  parseImportFile,
  parseMeasuredAt,
  parseNumeric,
  rowHash,
  validateColumnMapping,
} from './importPipeline.js'

const PROCESSING_VERSION = 'import-pipeline-v1'
const MAX_ATTEMPTS = 5
const UNIT_ALIASES = new Map([
  ['%', '%'], ['percent', '%'], ['percentual', '%'], ['porcento', '%'],
  ['fraction', 'fraction'], ['decimalfraction', 'fraction'], ['fracaodecimal', 'fraction'],
  ['fractiondecimal', 'fraction'], ['fracao', 'fraction'],
])
const NON_SYNCHRONIZED = new Set(['pending', 'pendente', 'offline', 'contingencia', 'contingência', 'nao sincronizado', 'não sincronizado'])
const CATEGORIES = new Set([
  'structural', 'typing', 'unit_scale', 'technical_range', 'temporal',
  'duplication', 'referential_integrity', 'field_coherence', 'traceability',
  'contingency_sync', 'source_reconciliation',
])

function systemContext(organizationId) {
  return {
    organizationId,
    userId: '',
    allowedUnitIds: ['*'],
    allowedFrontIds: ['*'],
    permissionCodes: [
      'imports:can_read', 'imports:can_write',
      'harvests:can_read', 'harvests:can_write',
      'measurements:can_read', 'measurements:can_write',
      'quality:can_read', 'quality:can_write', 'analytics:can_read', 'analytics:can_write',
      'equipment:can_read', 'catalogs:can_read', 'units:can_read', 'rules:can_read',
    ],
    accessLevel: 'strategic',
    department: 'ti',
  }
}

function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

function canonicalUnit(value) {
  const key = fold(value).replace(/[\s_-]+/g, '')
  return UNIT_ALIASES.get(key) || key
}

export function normalizeImportedValue(indicatorName, numericValue, originalUnit) {
  const originalUnitKey = canonicalUnit(originalUnit)
  const isFractionalMoisture = fold(indicatorName) === 'umidade_lab' && originalUnitKey === 'fraction'
  if (!isFractionalMoisture) {
    return { value: numericValue, unit: String(originalUnit ?? '').trim(), ruleApplied: null, isFractionalMoisture: false, error: null }
  }
  if (numericValue === null || numericValue <= 0 || numericValue > 1) {
    return { value: numericValue, unit: String(originalUnit ?? '').trim(), ruleApplied: null, isFractionalMoisture: true, error: 'UMIDADE_LAB em fração decimal deve estar entre 0 e 1.' }
  }
  return {
    value: percentage(numericValue * 100),
    unit: '%',
    ruleApplied: 'UMIDADE_LAB:fraction_to_percent:v1',
    isFractionalMoisture: true,
    error: null,
  }
}

function addIssue(issues, category, code, message, value = null) {
  issues.push({ category, code, message, ...(value === null ? {} : { value: String(value) }) })
}

function percentage(value) {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : value
}

async function ensureDimension(client, organizationId, table, keyColumn, keyValue, columns, values) {
  const columnList = ['organization_id', ...columns].join(', ')
  const placeholders = values.map((_, index) => `$${index + 2}`).join(', ')
  await client.query(
    `INSERT INTO ${table} (${columnList}) VALUES ($1, ${placeholders})
     ON CONFLICT (organization_id, ${keyColumn}) DO NOTHING`,
    [organizationId, ...values],
  )
  const result = await client.query(
    `SELECT id FROM ${table} WHERE organization_id=$1 AND ${keyColumn}=$2`,
    [organizationId, keyValue],
  )
  if (!result.rowCount) throw new Error(`dimensão ${table} não foi criada ou localizada.`)
  return Number(result.rows[0].id)
}

async function ensureImportFactDimensions(client, batch, eventAt) {
  const organization = await client.query('SELECT name FROM organizations WHERE id=$1', [batch.organization_id])
  const source = await client.query('SELECT name, source_type FROM sources WHERE organization_id=$1 AND id=$2', [batch.organization_id, batch.source_id])
  const unit = await client.query('SELECT name FROM units WHERE organization_id=$1 AND id=$2', [batch.organization_id, batch.unit_id])
  if (!organization.rowCount || !source.rowCount || !unit.rowCount) throw new Error('dimensão organizacional, fonte ou usina não encontrada.')
  const calendarDate = eventAt.toISOString().slice(0, 10)
  const common = {
    org: await ensureDimension(client, batch.organization_id, 'dim_org', 'org_code', batch.organization_id, ['org_code', 'org_name'], [batch.organization_id, organization.rows[0].name]),
    unit: await ensureDimension(client, batch.organization_id, 'dim_unit', 'unit_id', batch.unit_id, ['unit_id', 'unit_name'], [batch.unit_id, unit.rows[0].name]),
    source: await ensureDimension(client, batch.organization_id, 'dim_source', 'source_id', batch.source_id, ['source_id', 'source_name', 'source_type'], [batch.source_id, source.rows[0].name, source.rows[0].source_type]),
    date: await ensureDimension(client, batch.organization_id, 'dim_date', 'calendar_date', calendarDate, ['calendar_date', 'year', 'month', 'day'], [calendarDate, eventAt.getUTCFullYear(), eventAt.getUTCMonth() + 1, eventAt.getUTCDate()]),
  }
  if (batch.harvest_id) {
    const harvest = await client.query('SELECT name FROM harvests WHERE organization_id=$1 AND id=$2', [batch.organization_id, batch.harvest_id])
    if (harvest.rowCount) {
      common.harvest = await ensureDimension(
        client, batch.organization_id, 'dim_harvest', 'harvest_id', batch.harvest_id,
        ['harvest_id', 'harvest_name', 'unit_id'], [batch.harvest_id, harvest.rows[0].name, batch.unit_id],
      )
    }
  }
  return common
}

async function loadReferenceData(db, organizationId, unitId, indicatorIds = []) {
  const [equipment, indicators, units, rules] = await Promise.all([
    db.query(
      'SELECT id, name FROM equipment WHERE organization_id=$1 AND unit_id=$2',
      [organizationId, unitId], organizationId,
    ),
    db.query(
      'SELECT i.id, i.name, i.unit_of_measure_id, u.symbol AS unit_symbol, u.name AS unit_name FROM indicator_definitions i LEFT JOIN unit_of_measure u ON u.organization_id=i.organization_id AND u.id=i.unit_of_measure_id WHERE i.organization_id=$1',
      [organizationId], organizationId,
    ),
    db.query(
      'SELECT name, symbol FROM unit_of_measure WHERE organization_id=$1',
      [organizationId], organizationId,
    ),
    db.query(
      `SELECT indicator_id, minimum_value, maximum_value, name, version
       FROM technical_rules
       WHERE organization_id=$1 AND active=true AND homologation_status='homologated'
         AND indicator_id = ANY($2::bigint[])`,
      [organizationId, indicatorIds], organizationId,
    ),
  ])
  const equipmentByName = new Map()
  for (const row of equipment.rows) {
    equipmentByName.set(fold(row.name), [...(equipmentByName.get(fold(row.name)) || []), row])
  }
  const indicatorsByName = new Map()
  for (const row of indicators.rows) {
    indicatorsByName.set(fold(row.name), [...(indicatorsByName.get(fold(row.name)) || []), row])
  }
  return {
    equipment: equipmentByName,
    indicators: indicatorsByName,
    units: new Set(units.rows.flatMap((row) => [canonicalUnit(row.symbol), canonicalUnit(row.name)])),
    rules: rules.rows,
  }
}

async function loadTargetReferenceData(db, organizationId, unitId) {
  const [indicators, units, suppliers, farms, plots, fronts, methods, existingLoads, samples, rules] = await Promise.all([
    db.query(
      `SELECT i.id, i.name, u.symbol AS unit_symbol
       FROM indicator_definitions i
       LEFT JOIN unit_of_measure u ON u.organization_id=i.organization_id AND u.id=i.unit_of_measure_id
       WHERE i.organization_id=$1`,
      [organizationId], organizationId,
    ),
    db.query('SELECT name, symbol FROM unit_of_measure WHERE organization_id=$1', [organizationId], organizationId),
    db.query('SELECT id, name FROM suppliers WHERE organization_id=$1', [organizationId], organizationId),
    db.query('SELECT id, name FROM farms WHERE organization_id=$1 AND unit_id=$2', [organizationId, unitId], organizationId),
    db.query('SELECT id, code AS name FROM plots WHERE organization_id=$1 AND unit_id=$2', [organizationId, unitId], organizationId),
    db.query('SELECT id, name FROM fronts WHERE organization_id=$1 AND unit_id=$2', [organizationId, unitId], organizationId),
    db.query('SELECT id, name FROM analytical_methods WHERE organization_id=$1', [organizationId], organizationId),
    db.query('SELECT id, external_reference FROM loads WHERE organization_id=$1 AND unit_id=$2 AND external_reference IS NOT NULL', [organizationId, unitId], organizationId),
    db.query('SELECT sample_code, unit_id FROM samples WHERE organization_id=$1', [organizationId], organizationId),
    db.query(
      `SELECT indicator_id, minimum_value, maximum_value, name, version
       FROM technical_rules
       WHERE organization_id=$1 AND active=true AND homologation_status='homologated'`,
      [organizationId], organizationId,
    ),
  ])
  const indexByName = (rows) => {
    const index = new Map()
    for (const row of rows) index.set(fold(row.name), [...(index.get(fold(row.name)) || []), row])
    return index
  }
  return {
    indicators: indexByName(indicators.rows),
    units: new Set(units.rows.flatMap((row) => [canonicalUnit(row.symbol), canonicalUnit(row.name)])),
    suppliers: indexByName(suppliers.rows),
    farms: indexByName(farms.rows),
    plots: indexByName(plots.rows),
    fronts: indexByName(fronts.rows),
    methods: indexByName(methods.rows),
    loads: new Map(existingLoads.rows.map((row) => [fold(row.external_reference), row])),
    samples: new Map(samples.rows.map((row) => [fold(row.sample_code), row])),
    rules: rules.rows,
  }
}

function finishTargetRow(entry, issues, normalizedPayload) {
  const hasRejected = issues.some((issue) => ['structural', 'typing'].includes(issue.category))
  const hasSuspect = issues.some((issue) => [
    'unit_scale', 'technical_range', 'temporal', 'duplication',
    'field_coherence', 'source_reconciliation',
  ].includes(issue.category))
  const hasPending = issues.some((issue) => [
    'referential_integrity', 'traceability', 'contingency_sync',
  ].includes(issue.category))
  const queue = hasRejected ? 'Rejeitados' : hasSuspect ? 'Suspeitos' : hasPending ? 'Pendentes' : 'Aceitos'
  return {
    sourceRowNumber: entry.rowNumber,
    raw: entry.raw,
    rowSha256: rowHash(entry.raw),
    queue,
    issues: issues.filter((issue) => CATEGORIES.has(issue.category)),
    normalizedPayload: queue === 'Aceitos' ? normalizedPayload : null,
  }
}

function targetMetrics(rows, timestamps, receivedAt, requiredValues, requiredCells, recognizedUnitRows, unitRows, referentiallyValidRows, duplicateRows, reconciliationChecked, reconciliationConsistent, indicatorCounts) {
  const total = rows.length
  const delays = timestamps.map((timestamp) => Math.max(0, receivedAt.getTime() - timestamp.getTime()))
  const averageDelaySeconds = delays.length
    ? Number((delays.reduce((sum, delay) => sum + delay, 0) / delays.length / 1000).toFixed(2))
    : null
  const queues = Object.fromEntries(IMPORT_QUEUES.map((queue) => [queue, rows.filter((row) => row.queue === queue).length]))
  return {
    completeness: { populatedRequiredCells: requiredValues, requiredCells, percent: requiredCells ? Number((requiredValues / requiredCells * 100).toFixed(2)) : null },
    freshness: { measuredRows: timestamps.length, averageDelaySeconds, maximumDelaySeconds: delays.length ? Number((delays.reduce((maximum, delay) => Math.max(maximum, delay), 0) / 1000).toFixed(2)) : null },
    duplication: { duplicateRows, totalRows: total, percent: total ? Number((duplicateRows / total * 100).toFixed(2)) : null },
    referentialIntegrity: { resolvedRows: referentiallyValidRows, totalRows: total, percent: total ? Number((referentiallyValidRows / total * 100).toFixed(2)) : null },
    recognizedUnits: { recognizedRows: recognizedUnitRows, unitRows, percent: unitRows ? Number((recognizedUnitRows / unitRows * 100).toFixed(2)) : null },
    sourceReconciliation: { checkedRows: reconciliationChecked, consistentRows: reconciliationConsistent, percent: reconciliationChecked ? Number((reconciliationConsistent / reconciliationChecked * 100).toFixed(2)) : null },
    indicatorCoverage: { distinctIndicators: Object.keys(indicatorCounts).length, counts: indicatorCounts },
    queues,
  }
}

export function validateTargetImportRows(document, batch, references, receivedAt, existingRows = []) {
  const entityType = batch.entity_type
  const mapping = batch.mapping_json
  const mappingError = validateColumnMapping(mapping, document.headers, entityType)
  if (mappingError) throw Object.assign(new Error(mappingError), { status: 422 })
  const existingByKey = new Map()
  for (const row of existingRows) {
    const key = entityType === 'loads'
      ? fold(row.external_reference)
      : `${fold(row.sample_code)}:${row.indicator_id}:${new Date(row.measured_at).toISOString()}`
    existingByKey.set(key, [...(existingByKey.get(key) || []), row])
  }
  const seen = new Set()
  const timestamps = []
  const output = []
  const indicatorCounts = {}
  let requiredValues = 0
  const requiredFields = entityType === 'loads'
    ? ['external_reference', 'weighed_at', 'gross_weight', 'tare_weight']
    : ['sample_code', 'indicator', 'measured_at', 'value', 'unit_of_measure']
  let recognizedUnitRows = 0
  let unitRows = 0
  let referentiallyValidRows = 0
  let duplicateRows = 0
  let reconciliationChecked = 0
  let reconciliationConsistent = 0
  const receiptTime = receivedAt.getTime()

  for (const entry of document.rows) {
    const values = Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, header ? entry.raw[header] ?? '' : '']))
    const issues = []
    if (entry.fieldCount !== document.headers.length || entry.extraColumnCount > 0) {
      addIssue(issues, 'structural', 'column_count_mismatch', 'quantidade de campos da linha difere do cabeçalho.')
    }
    for (const field of requiredFields) if (String(values[field] ?? '').trim()) requiredValues += 1
    const measuredAt = parseMeasuredAt(entityType === 'loads' ? values.weighed_at : values.measured_at)
    if (!String(entityType === 'loads' ? values.weighed_at : values.measured_at).trim()) addIssue(issues, 'structural', 'missing_measured_at', 'data/hora do evento ausente.')
    else if (!measuredAt) addIssue(issues, 'typing', 'invalid_measured_at', 'data/hora do evento inválida.')
    else if (measuredAt.getTime() > receiptTime) addIssue(issues, 'temporal', 'future_measured_at', 'data/hora do evento é posterior ao recebimento do lote.')
    if (measuredAt) timestamps.push(measuredAt)

    let payload
    if (entityType === 'loads') {
      const externalReference = String(values.external_reference ?? '').trim()
      const grossWeight = parseNumeric(values.gross_weight)
      const tareWeight = parseNumeric(values.tare_weight)
      const weightUnit = String(values.weight_unit ?? '').trim().toLowerCase()
      if (!externalReference) addIssue(issues, 'structural', 'missing_load_reference', 'identificador único da carga ausente.')
      if (!String(values.gross_weight ?? '').trim()) addIssue(issues, 'structural', 'missing_gross_weight', 'peso bruto ausente.')
      else if (grossWeight === null) addIssue(issues, 'typing', 'invalid_gross_weight', 'peso bruto não é numérico.')
      if (!String(values.tare_weight ?? '').trim()) addIssue(issues, 'structural', 'missing_tare_weight', 'tara ausente.')
      else if (tareWeight === null) addIssue(issues, 'typing', 'invalid_tare_weight', 'tara não é numérica.')
      if (weightUnit && !['kg', 'quilograma', 'quilogramas', 't', 'ton', 'tonne', 'tonnes', 'tonelada', 'toneladas'].includes(weightUnit)) {
        addIssue(issues, 'typing', 'invalid_weight_unit', 'a unidade do peso deve ser kg ou tonelada.')
      }
      for (const [field, weight] of [['gross_weight', grossWeight], ['tare_weight', tareWeight]]) {
        if (weight !== null && (
          weight >= 10_000_000_000_000
          || Math.abs(weight * 1000 - Math.round(weight * 1000)) > 1e-7
        )) {
          addIssue(issues, 'typing', `invalid_${field}_precision`, `${field} excede a faixa/precisão suportada de 3 casas decimais.`, values[field])
        }
      }
      if (grossWeight !== null && grossWeight < 0 || tareWeight !== null && tareWeight < 0) {
        addIssue(issues, 'field_coherence', 'negative_weight', 'pesos não podem ser negativos.')
      } else if (grossWeight !== null && tareWeight !== null && grossWeight < tareWeight) {
        addIssue(issues, 'field_coherence', 'tare_exceeds_gross', 'peso bruto deve ser maior ou igual à tara.')
      }
      const key = fold(externalReference)
      if (key && (seen.has(key) || existingByKey.has(key))) {
        duplicateRows += 1
        addIssue(issues, 'duplication', 'duplicate_load_reference', 'identificador da carga já existe; cargas distintas devem usar referências distintas.', externalReference)
      }
      if (key) seen.add(key)
      const related = {}
      const syncStatus = fold(values.sync_status)
      if (mapping.sync_status && syncStatus && NON_SYNCHRONIZED.has(syncStatus)) {
        addIssue(issues, 'contingency_sync', 'not_synchronized', 'registro de contingência ainda não sincronizado.', values.sync_status)
      }
      for (const field of ['supplier', 'farm', 'plot', 'front']) {
        if (!String(values[field] ?? '').trim()) continue
        const matches = references[`${field}s`]?.get(fold(values[field])) || []
        if (matches.length !== 1) addIssue(issues, 'referential_integrity', `unknown_${field}`, `${field} não encontrado ou ambíguo na organização/usina.`, values[field])
        else related[`${field}Id`] = Number(matches[0].id)
      }
      const hasReferentialIssue = issues.some((issue) => issue.category === 'referential_integrity')
      if (!hasReferentialIssue) referentiallyValidRows += 1
      if (key && existingByKey.has(key)) reconciliationChecked += 1
      payload = measuredAt && externalReference && grossWeight !== null && tareWeight !== null
        ? {
            externalReference, weighedAt: measuredAt.toISOString(), grossWeight, tareWeight,
            weightUnit: weightUnit || null,
            ...related,
            supplierName: String(values.supplier ?? '').trim(),
            farmName: String(values.farm ?? '').trim(),
            plotName: String(values.plot ?? '').trim(),
            frontName: String(values.front ?? '').trim(),
          }
        : null
    } else {
      const sampleCode = String(values.sample_code ?? '').trim()
      const sample = references.samples.get(fold(sampleCode))
      if (sample && String(sample.unit_id) !== String(batch.unit_id)) {
        addIssue(issues, 'referential_integrity', 'sample_other_unit', 'código da amostra já está associado a outra usina.', sampleCode)
      }
      const numericValue = parseNumeric(values.value)
      const candidates = references.indicators.get(fold(values.indicator)) || []
      const indicator = candidates.length === 1 ? candidates[0] : null
      if (!sampleCode) addIssue(issues, 'structural', 'missing_sample_code', 'código da amostra ausente.')
      if (!String(values.value ?? '').trim()) addIssue(issues, 'structural', 'missing_value', 'resultado ausente.')
      else if (numericValue === null) addIssue(issues, 'typing', 'invalid_value', 'resultado não é numérico.')
      if (!String(values.indicator ?? '').trim()) addIssue(issues, 'structural', 'missing_indicator', 'indicador ausente.')
      else if (candidates.length !== 1) addIssue(issues, 'referential_integrity', 'unknown_indicator', 'indicador não cadastrado ou ambíguo na organização.', values.indicator)
      if (indicator) indicatorCounts[indicator.name] = (indicatorCounts[indicator.name] || 0) + 1
      const normalized = normalizeImportedValue(indicator?.name, numericValue, values.unit_of_measure)
      if (!String(values.unit_of_measure ?? '').trim()) addIssue(issues, 'structural', 'missing_unit', 'unidade original ausente.')
      else {
        unitRows += 1
        const unit = canonicalUnit(values.unit_of_measure)
        if (references.units.has(unit) || UNIT_ALIASES.has(unit)) recognizedUnitRows += 1
        else addIssue(issues, 'unit_scale', 'unknown_unit', 'unidade não reconhecida; requer revisão humana.', values.unit_of_measure)
        if (normalized.error) addIssue(issues, 'unit_scale', 'invalid_fraction_scale', normalized.error, values.value)
      }
      if (indicator?.unit_symbol && normalized.unit && canonicalUnit(indicator.unit_symbol) !== canonicalUnit(normalized.unit)) {
        addIssue(issues, 'field_coherence', 'indicator_unit_mismatch', 'unidade não corresponde à unidade cadastrada para o indicador.')
      }
      const methodCandidates = references.methods.get(fold(values.method)) || []
      const method = values.method ? methodCandidates.length === 1 ? methodCandidates[0] : null : null
      if (!String(values.method ?? '').trim()) addIssue(issues, 'traceability', 'missing_method', 'método analítico não informado.')
      else if (!method) addIssue(issues, 'referential_integrity', 'unknown_method', 'método analítico não cadastrado ou ambíguo.', values.method)
      const matchedRules = indicator
        ? references.rules.filter((rule) => String(rule.indicator_id) === String(indicator.id))
        : []
      for (const rule of matchedRules) {
        const below = rule.minimum_value !== null && Number(normalized.value) < Number(rule.minimum_value)
        const above = rule.maximum_value !== null && Number(normalized.value) > Number(rule.maximum_value)
        if (normalized.value !== null && (below || above)) {
          addIssue(issues, 'technical_range', 'homologated_range_violation', `resultado fora da faixa homologada da regra ${rule.name} (${rule.version}).`, values.value)
        }
      }
      const loadReference = String(values.load_reference ?? '').trim()
      const load = loadReference ? references.loads.get(fold(loadReference)) : null
      if (loadReference && !load) addIssue(issues, 'referential_integrity', 'unknown_load', 'carga da amostra não encontrada nesta usina.', loadReference)
      const key = measuredAt && indicator ? `${fold(sampleCode)}:${indicator.id}:${measuredAt.toISOString()}` : ''
      const priorRows = key ? existingByKey.get(key) || [] : []
      const otherSources = priorRows.filter((prior) => String(prior.source_id) !== String(batch.source_id))
      const sameSourceRows = priorRows.filter((prior) => String(prior.source_id) === String(batch.source_id))
      const sameValue = (prior) => normalized.value !== null && prior.valor_normalizado !== null && Number(prior.valor_normalizado) === Number(normalized.value)
      const matchesOtherSource = otherSources.filter(sameValue)
      const conflictsOtherSource = otherSources.filter((prior) => prior.valor_normalizado !== null && !sameValue(prior))
      reconciliationChecked += otherSources.length
      reconciliationConsistent += matchesOtherSource.length
      if (key && (seen.has(key) || sameSourceRows.length || matchesOtherSource.length)) {
        duplicateRows += 1
        addIssue(issues, 'duplication', 'duplicate_analysis', 'análise para a mesma amostra, indicador e horário já existe.')
      }
      if (conflictsOtherSource.length) {
        addIssue(issues, 'source_reconciliation', 'source_value_conflict', 'fontes divergem para a mesma amostra, indicador e horário.', values.value)
      }
      if (key) seen.add(key)
      const hasReferentialIssue = issues.some((issue) => issue.category === 'referential_integrity')
      if (!hasReferentialIssue) referentiallyValidRows += 1
      payload = measuredAt && sampleCode && indicator && numericValue !== null
        ? {
            sampleCode, loadId: load ? Number(load.id) : null,
            indicatorId: Number(indicator.id), methodId: method ? Number(method.id) : null,
            measuredAt: measuredAt.toISOString(), originalValue: String(values.value),
            originalUnit: String(values.unit_of_measure), normalizedValue: normalized.value,
            normalizedUnit: normalized.unit,
            ruleApplied: normalized.ruleApplied || matchedRules.map((rule) => `${rule.name}@${rule.version}`).join(', ') || null,
          }
        : null
      const syncStatus = fold(values.sync_status)
      if (mapping.sync_status && syncStatus && NON_SYNCHRONIZED.has(syncStatus)) {
        addIssue(issues, 'contingency_sync', 'not_synchronized', 'registro de contingência ainda não sincronizado.')
      }
    }
    const normalizedPayload = issues.some((issue) => ['structural', 'typing'].includes(issue.category)) ? null : payload
    const row = finishTargetRow(entry, issues, normalizedPayload)
    output.push(row)
  }
  const metrics = targetMetrics(
    output, timestamps, receivedAt, requiredValues, requiredFields.length * document.rows.length,
    recognizedUnitRows, unitRows, referentiallyValidRows, duplicateRows,
    reconciliationChecked, reconciliationConsistent, indicatorCounts,
  )
  return { rows: output, qualityMetrics: metrics }
}

export function validateImportRows(document, batch, references, receivedAt, existingMeasurements) {
  const mapping = batch.mapping_json
  const mappingError = validateColumnMapping(mapping, document.headers)
  if (mappingError) throw Object.assign(new Error(mappingError), { status: 422 })
  const rowsSeen = new Map()
  const checkedRows = []
  const timestamps = []
  let requiredValues = 0
  let requiredCells = 0
  let recognizedUnitRows = 0
  let unitRows = 0
  let referentiallyValidRows = 0
  let duplicateRows = 0
  let reconciliationChecked = 0
  let reconciliationConsistent = 0
  const indicatorCounts = {}
  const existingByKey = new Map()
  for (const row of existingMeasurements) {
    const key = `${row.equipment_id}:${row.indicator_id}:${new Date(row.measured_at).toISOString()}`
    existingByKey.set(key, [...(existingByKey.get(key) || []), row])
  }
  const receiptTime = receivedAt.getTime()

  for (const entry of document.rows) {
    const raw = entry.raw
    const issues = []
    if (entry.fieldCount !== document.headers.length || entry.extraColumnCount > 0) {
      addIssue(issues, 'structural', 'column_count_mismatch', 'quantidade de campos da linha difere do cabeçalho.')
    }
    const values = Object.fromEntries(Object.entries(mapping).map(([field, header]) => [
      field, header ? raw[header] ?? '' : '',
    ]))
    for (const field of ['measured_at', 'equipment', 'indicator', 'value', 'unit_of_measure']) {
      requiredCells += 1
      if (String(values[field] ?? '').trim() !== '') requiredValues += 1
    }

    const measuredAt = parseMeasuredAt(values.measured_at)
    if (!String(values.measured_at ?? '').trim()) addIssue(issues, 'structural', 'missing_measured_at', 'data/hora da medição ausente.')
    else if (!measuredAt) addIssue(issues, 'typing', 'invalid_measured_at', 'data/hora da medição inválida.', values.measured_at)
    else if (measuredAt.getTime() > receiptTime) addIssue(issues, 'temporal', 'future_measured_at', 'data/hora da medição é posterior ao recebimento do lote.', values.measured_at)

    const numericValue = parseNumeric(values.value)
    if (!String(values.value ?? '').trim()) addIssue(issues, 'structural', 'missing_value', 'valor da medição ausente.')
    else if (numericValue === null) addIssue(issues, 'typing', 'invalid_value', 'valor da medição não é numérico.', values.value)

    const indicatorCandidates = references.indicators.get(fold(values.indicator)) || []
    const indicator = indicatorCandidates.length === 1 ? indicatorCandidates[0] : null
    if (!String(values.indicator ?? '').trim()) addIssue(issues, 'structural', 'missing_indicator', 'indicador ausente.')
    else if (indicatorCandidates.length === 0) addIssue(issues, 'referential_integrity', 'unknown_indicator', 'indicador não cadastrado na organização.', values.indicator)
    else if (indicatorCandidates.length > 1) addIssue(issues, 'referential_integrity', 'ambiguous_indicator', 'mais de um indicador corresponde ao nome informado.', values.indicator)
    if (indicator) indicatorCounts[indicator.name] = (indicatorCounts[indicator.name] || 0) + 1

    const equipmentCandidates = references.equipment.get(fold(values.equipment)) || []
    const equipment = equipmentCandidates.length === 1 ? equipmentCandidates[0] : null
    if (!String(values.equipment ?? '').trim()) addIssue(issues, 'traceability', 'missing_equipment', 'equipamento de origem ausente.')
    else if (equipmentCandidates.length === 0) addIssue(issues, 'referential_integrity', 'unknown_equipment', 'equipamento não cadastrado ou fora da usina selecionada.', values.equipment)
    else if (equipmentCandidates.length > 1) addIssue(issues, 'referential_integrity', 'ambiguous_equipment', 'mais de um equipamento possui este nome na usina; mapeie um identificador único.', values.equipment)

    const originalUnitKey = canonicalUnit(values.unit_of_measure)
    const normalized = normalizeImportedValue(indicator?.name, numericValue, values.unit_of_measure)
    let normalizedValue = normalized.value
    let normalizedUnit = normalized.unit
    if (!String(values.unit_of_measure ?? '').trim()) addIssue(issues, 'structural', 'missing_unit', 'unidade original ausente.')
    else {
      unitRows += 1
      const recognized = references.units.has(originalUnitKey) || UNIT_ALIASES.has(originalUnitKey)
      if (recognized) recognizedUnitRows += 1
      else addIssue(issues, 'unit_scale', 'unknown_unit', 'unidade não reconhecida; requer revisão humana.', values.unit_of_measure)
      if (normalized.error) addIssue(issues, 'unit_scale', 'invalid_fraction_scale', normalized.error, values.value)
      else if (fold(indicator?.name) === 'umidade_lab' && originalUnitKey === '%' && numericValue !== null && numericValue > 0 && numericValue < 1) {
        addIssue(issues, 'unit_scale', 'ambiguous_percent_scale', 'UMIDADE_LAB está entre 0 e 1 com unidade percentual; confirme se a origem não é fração decimal.', values.value)
      }
    }

    if (indicator && normalizedUnit && indicator.unit_symbol && canonicalUnit(normalizedUnit) !== canonicalUnit(indicator.unit_symbol)) {
      addIssue(issues, 'field_coherence', 'indicator_unit_mismatch', 'unidade não corresponde à unidade cadastrada para o indicador.', `${normalizedUnit} / ${indicator.unit_symbol}`)
    }

    const matchedRules = indicator
      ? references.rules.filter((rule) => String(rule.indicator_id) === String(indicator.id))
      : []
    for (const rule of matchedRules) {
      const below = rule.minimum_value !== null && Number(normalizedValue) < Number(rule.minimum_value)
      const above = rule.maximum_value !== null && Number(normalizedValue) > Number(rule.maximum_value)
      if (normalizedValue !== null && (below || above)) {
        addIssue(issues, 'technical_range', 'homologated_range_violation', `valor fora da faixa homologada da regra ${rule.name} (${rule.version}).`, values.value)
      }
    }

    const syncStatus = fold(values.sync_status)
    if (mapping.sync_status && syncStatus && NON_SYNCHRONIZED.has(syncStatus)) {
      addIssue(issues, 'contingency_sync', 'not_synchronized', 'registro de contingência ainda não sincronizado.', values.sync_status)
    }

    const referentialIssues = issues.some((issue) => issue.category === 'referential_integrity' || issue.category === 'traceability')
    if (!referentialIssues) referentiallyValidRows += 1
    if (measuredAt) timestamps.push(Math.max(0, receivedAt.getTime() - measuredAt.getTime()))
    const key = measuredAt && numericValue !== null && equipment && indicator
      ? `${equipment.id}:${indicator.id}:${measuredAt.toISOString()}`
      : ''
    const eventId = String(values.event_id ?? '').trim()
    const duplicateKey = eventId ? `event:${eventId}` : key
    if (duplicateKey && rowsSeen.has(duplicateKey)) {
      duplicateRows += 1
      addIssue(issues, 'duplication', 'duplicate_measurement_in_file', 'evento/equipamento/indicador e horário já aparecem em outra linha do arquivo.', values.event_id || values.measured_at)
    } else if (duplicateKey) {
      rowsSeen.set(duplicateKey, numericValue)
    }
    if (key && existingByKey.has(key)) {
      const priorRows = existingByKey.get(key)
      const otherSources = priorRows.filter((prior) => String(prior.source_id) !== String(batch.source_id))
      const sameSourceRows = priorRows.filter((prior) => String(prior.source_id) === String(batch.source_id))
      const sameValue = (prior) => prior.valor_normalizado !== null && Number(prior.valor_normalizado) === Number(normalizedValue)
      const matchesOtherSource = otherSources.filter(sameValue)
      const conflictsOtherSource = otherSources.filter((prior) => prior.valor_normalizado !== null && !sameValue(prior))
      reconciliationChecked += otherSources.length
      reconciliationConsistent += matchesOtherSource.length
      if (matchesOtherSource.length || sameSourceRows.some((prior) => Number(prior.valor_normalizado) === Number(normalizedValue))) {
        duplicateRows += 1
        addIssue(issues, 'duplication', 'duplicate_measurement_existing', 'medição equivalente já existe na base tratada.', values.measured_at)
      }
      if (conflictsOtherSource.length) {
        addIssue(issues, 'source_reconciliation', 'source_value_conflict', 'fontes divergem para o mesmo equipamento, indicador e horário.', values.value)
      }
      if (!otherSources.length && sameSourceRows.some((prior) => prior.valor_normalizado !== null && !sameValue(prior))) {
        addIssue(issues, 'duplication', 'conflicting_measurement_existing', 'já existe uma medição divergente do mesmo evento nesta fonte.', values.value)
      }
    }

    const hasRejectedIssue = issues.some((issue) => ['structural', 'typing'].includes(issue.category))
    const hasSuspectIssue = issues.some((issue) => [
      'unit_scale', 'technical_range', 'temporal', 'duplication',
      'field_coherence', 'source_reconciliation',
    ].includes(issue.category))
    const hasPendingIssue = issues.some((issue) => [
      'referential_integrity', 'traceability', 'contingency_sync',
    ].includes(issue.category))
    const queue = hasRejectedIssue ? 'Rejeitados' : hasSuspectIssue ? 'Suspeitos' : hasPendingIssue ? 'Pendentes' : 'Aceitos'
    const normalizedPayload = measuredAt && normalizedValue !== null && indicator && equipment
      ? {
          measuredAt: measuredAt.toISOString(),
          equipmentId: Number(equipment.id),
          indicatorId: Number(indicator.id),
          originalValue: String(values.value),
          originalUnit: String(values.unit_of_measure),
          normalizedValue,
          normalizedUnit,
          ruleApplied: normalized.ruleApplied || matchedRules.map((rule) => `${rule.name}@${rule.version}`).join(', ') || null,
          eventId: eventId || null,
        }
      : null
    checkedRows.push({
      sourceRowNumber: entry.rowNumber,
      raw,
      rowSha256: rowHash(raw),
      queue,
      issues: issues.filter((issue) => CATEGORIES.has(issue.category)),
      normalizedPayload,
    })
  }

  const total = checkedRows.length
  const queues = Object.fromEntries(IMPORT_QUEUES.map((queue) => [queue, checkedRows.filter((row) => row.queue === queue).length]))
  const averageDelaySeconds = timestamps.length
    ? Number((timestamps.reduce((sum, delay) => sum + delay, 0) / timestamps.length / 1000).toFixed(2))
    : null
  const qualityMetrics = {
    completeness: { populatedRequiredCells: requiredValues, requiredCells, percent: requiredCells ? Number((requiredValues / requiredCells * 100).toFixed(2)) : null },
    freshness: { measuredRows: timestamps.length, averageDelaySeconds, maximumDelaySeconds: timestamps.length ? Number((timestamps.reduce((maximum, delay) => Math.max(maximum, delay), 0) / 1000).toFixed(2)) : null },
    duplication: { duplicateRows, totalRows: total, percent: total ? Number((duplicateRows / total * 100).toFixed(2)) : null },
    referentialIntegrity: { resolvedRows: referentiallyValidRows, totalRows: total, percent: total ? Number((referentiallyValidRows / total * 100).toFixed(2)) : null },
    recognizedUnits: { recognizedRows: recognizedUnitRows, unitRows, percent: unitRows ? Number((recognizedUnitRows / unitRows * 100).toFixed(2)) : null },
    sourceReconciliation: { checkedRows: reconciliationChecked, consistentRows: reconciliationConsistent, percent: reconciliationChecked ? Number((reconciliationConsistent / reconciliationChecked * 100).toFixed(2)) : null },
    indicatorCoverage: { distinctIndicators: Object.keys(indicatorCounts).length, counts: indicatorCounts },
    queues,
  }
  return { rows: checkedRows, qualityMetrics }
}

async function processBatch(db, job) {
  const context = systemContext(job.organization_id)
  await withSecurityContext(context, async () => {
    const batchResult = await db.query(
      `SELECT id, organization_id, source_id, uploaded_by, unit_id, harvest_id, front_id, entity_type,
              object_key, original_filename, received_at, selected_sheet, mapping_json, status
       FROM import_batches WHERE id=$1 AND organization_id=$2`,
      [job.import_batch_id, job.organization_id], job.organization_id,
    )
    const batch = batchResult.rows[0]
    if (!batch || batch.status !== 'queued') throw new Error('lote não está disponível para processamento.')
    const startedAt = new Date()
    await db.query(
      'UPDATE import_batches SET status=\'processing\', processing_started_at=$3, failure_message=NULL WHERE id=$1 AND organization_id=$2',
      [batch.id, batch.organization_id, startedAt], batch.organization_id,
    )

    const original = await retrieveOriginal({ organizationId: batch.organization_id, objectKey: batch.object_key })
    const document = await parseImportFile(original.bytes, batch.original_filename, batch.selected_sheet || '')
    if (document.rows.length === 0) throw Object.assign(new Error('o arquivo não contém linhas de dados.'), { status: 422 })
    if (document.rows.length > 100_000) throw Object.assign(new Error('o arquivo excede o limite de 100.000 linhas.'), { status: 413 })
    const entityType = batch.entity_type || 'measurements'
    let references
    let existingRows = []
    let validation
    if (entityType === 'measurements') {
      const indicatorNames = [...new Set(document.rows.map((entry) => String(entry.raw[batch.mapping_json.indicator] ?? '').trim()).filter(Boolean))]
      const indicators = indicatorNames.length
        ? await db.query('SELECT id FROM indicator_definitions WHERE organization_id=$1 AND lower(name)=ANY($2::text[])', [batch.organization_id, indicatorNames.map((name) => name.toLowerCase())], batch.organization_id)
        : { rows: [] }
      references = await loadReferenceData(db, batch.organization_id, batch.unit_id, indicators.rows.map((row) => row.id))
      const dateField = batch.mapping_json.measured_at
      const timestamps = document.rows.map((row) => parseMeasuredAt(row.raw[dateField])).filter(Boolean).sort((a, b) => a - b)
      const existingQuery = timestamps.length
        ? await db.query(
            `SELECT equipment_id, indicator_id, measured_at, valor_normalizado, source_id
             FROM measurements
             WHERE organization_id=$1 AND unit_id=$2
               AND equipment_id IS NOT NULL AND indicator_id = ANY($3::bigint[])
               AND measured_at >= $4::timestamptz AND measured_at <= $5::timestamptz`,
            [batch.organization_id, batch.unit_id, indicators.rows.map((row) => row.id), timestamps[0], timestamps[timestamps.length - 1]],
            batch.organization_id,
          )
        : { rows: [] }
      existingRows = existingQuery.rows
      validation = validateImportRows(document, batch, references, new Date(batch.received_at), existingRows)
    } else {
      references = await loadTargetReferenceData(db, batch.organization_id, batch.unit_id)
      if (entityType === 'loads') {
        existingRows = [...references.loads.values()]
        validation = validateTargetImportRows(document, batch, references, new Date(batch.received_at), existingRows)
      } else {
        const timestamps = document.rows.map((row) => parseMeasuredAt(row.raw[batch.mapping_json.measured_at])).filter(Boolean).sort((a, b) => a - b)
        if (timestamps.length) {
          const sampleCodes = [...new Set(document.rows.map((row) => String(row.raw[batch.mapping_json.sample_code] ?? '').trim().toLowerCase()).filter(Boolean))]
          const existingQuery = await db.query(
            `SELECT s.sample_code, q.indicator_id, q.measured_at, q.valor_normalizado, q.source_id
             FROM quality_analyses q
             JOIN samples s ON s.organization_id=q.organization_id AND s.id=q.sample_id
             WHERE q.organization_id=$1 AND q.unit_id=$2
               AND lower(s.sample_code)=ANY($3::text[])
               AND q.measured_at >= $4::timestamptz AND q.measured_at <= $5::timestamptz`,
            [batch.organization_id, batch.unit_id, sampleCodes, timestamps[0], timestamps[timestamps.length - 1]],
            batch.organization_id,
          )
          existingRows = existingQuery.rows
        }
        validation = validateTargetImportRows(document, batch, references, new Date(batch.received_at), existingRows)
      }
    }
    const { rows, qualityMetrics } = validation
    const finishedAt = new Date()
    await db.transaction(async (client) => {
      const rawRows = rows.map((row) => ({
        organization_id: batch.organization_id,
        import_batch_id: Number(batch.id),
        source_row_number: row.sourceRowNumber,
        raw_payload: row.raw,
        row_sha256: row.rowSha256,
        received_at: batch.received_at,
        unit_id: batch.unit_id,
        front_id: batch.front_id,
        row_queue: row.queue,
        validation_issues: row.issues,
        normalized_payload: row.normalizedPayload,
      }))
      for (let offset = 0; offset < rawRows.length; offset += 500) {
        await client.query(
          `INSERT INTO raw_import_rows
            (organization_id, import_batch_id, source_row_number, raw_payload, row_sha256, received_at,
             unit_id, front_id, row_queue, validation_issues, normalized_payload)
           SELECT r.organization_id, r.import_batch_id, r.source_row_number, r.raw_payload, r.row_sha256,
                  r.received_at, r.unit_id, r.front_id, r.row_queue, r.validation_issues, r.normalized_payload
           FROM jsonb_to_recordset($1::jsonb) AS r(
             organization_id text, import_batch_id bigint, source_row_number bigint, raw_payload jsonb,
             row_sha256 char(64), received_at timestamptz, unit_id bigint, front_id bigint,
             row_queue text, validation_issues jsonb, normalized_payload jsonb
           )`,
          [JSON.stringify(rawRows.slice(offset, offset + 500))],
        )
      }
      const errorRows = rows.flatMap((row) => row.issues.map((issue) => ({
        organization_id: batch.organization_id,
        import_batch_id: Number(batch.id),
        unit_id: batch.unit_id,
        code: issue.code,
        message: issue.message,
        details: { value: issue.value || null },
        category: issue.category,
        row_queue: row.queue,
        source_row_number: row.sourceRowNumber,
      })))
      for (let offset = 0; offset < errorRows.length; offset += 500) {
        await client.query(
          `INSERT INTO validation_errors
            (organization_id, import_batch_id, unit_id, code, message, details, category, row_queue, source_row_number)
           SELECT r.organization_id, r.import_batch_id, r.unit_id, r.code, r.message, r.details,
                  r.category, r.row_queue, r.source_row_number
           FROM jsonb_to_recordset($1::jsonb) AS r(
             organization_id text, import_batch_id bigint, unit_id bigint, code text, message text,
             details jsonb, category text, row_queue text, source_row_number bigint
           )`,
          [JSON.stringify(errorRows.slice(offset, offset + 500))],
        )
      }
      for (const row of rows.filter((entry) => entry.queue === 'Aceitos' && entry.normalizedPayload)) {
        const value = row.normalizedPayload
        if (entityType === 'measurements') {
          await client.query(
            `INSERT INTO measurements (
               organization_id, harvest_id, equipment_id, unit_id, indicator_id, source_id,
               valor_original, unidade_original, valor_normalizado, unidade_normalizada, regra_aplicada,
               versao_processamento, responsavel_ou_processo, measured_at, received_at, processed_at, released_at,
               validation_status, import_batch_id, source_row_number
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,'valid',$17,$18
             )`,
            [
              batch.organization_id, batch.harvest_id, value.equipmentId, batch.unit_id, value.indicatorId, batch.source_id,
              value.originalValue, value.originalUnit, value.normalizedValue, value.normalizedUnit, value.ruleApplied,
              PROCESSING_VERSION, `import-batch:${batch.id}`, value.measuredAt, batch.received_at, finishedAt,
              batch.id, row.sourceRowNumber,
            ],
          )
        } else if (entityType === 'loads') {
          const createdLoad = await client.query(
            `INSERT INTO loads (
               organization_id, harvest_id, supplier_id, farm_id, plot_id, front_id, unit_id, source_id,
               external_reference, gross_weight, tare_weight, weight_unit, weighed_at, import_batch_id, source_row_number
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             RETURNING id`,
            [
              batch.organization_id, batch.harvest_id, value.supplierId || null, value.farmId || null,
              value.plotId || null, value.frontId || batch.front_id, batch.unit_id, batch.source_id,
              value.externalReference, value.grossWeight, value.tareWeight, value.weightUnit,
              value.weighedAt, batch.id, row.sourceRowNumber,
            ],
          )
          const dims = await ensureImportFactDimensions(client, batch, new Date(value.weighedAt))
          const relatedDimensions = {}
          for (const [field, dimTable, sourceTable, idColumn, nameColumn, labelColumn] of [
            ['supplier', 'dim_supplier', 'suppliers', 'supplier_id', 'name', 'supplier_name'],
            ['farm', 'dim_farm', 'farms', 'farm_id', 'name', 'farm_name'],
            ['plot', 'dim_plot', 'plots', 'plot_id', 'code', 'plot_code'],
            ['front', 'dim_front', 'fronts', 'front_id', 'name', 'front_name'],
          ]) {
            const id = value[`${field}Id`]
            if (!id) {
              relatedDimensions[`${field}DimId`] = null
              continue
            }
            const related = await client.query(
              `SELECT ${nameColumn} AS name FROM ${sourceTable} WHERE organization_id=$1 AND id=$2`,
              [batch.organization_id, id],
            )
            relatedDimensions[`${field}DimId`] = await ensureDimension(
              client, batch.organization_id, dimTable, idColumn, id,
              [idColumn, labelColumn, 'unit_id'], [id, related.rows[0].name, batch.unit_id],
            )
          }
          await client.query(
            `INSERT INTO fact_loads_weighing (
               organization_id, load_id, date_id, org_dim_id, unit_dim_id, harvest_dim_id,
               supplier_dim_id, farm_dim_id, plot_dim_id, front_dim_id, source_dim_id,
               gross_weight, tare_weight, net_weight, weighed_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              batch.organization_id, createdLoad.rows[0].id, dims.date, dims.org, dims.unit, dims.harvest || null,
              relatedDimensions.supplierDimId, relatedDimensions.farmDimId, relatedDimensions.plotDimId,
              relatedDimensions.frontDimId, dims.source, value.grossWeight, value.tareWeight,
              value.grossWeight - value.tareWeight, value.weighedAt,
            ],
          )
        } else {
          let sample = await client.query(
            'SELECT id FROM samples WHERE organization_id=$1 AND unit_id=$2 AND sample_code=$3',
            [batch.organization_id, batch.unit_id, value.sampleCode],
          )
          if (!sample.rowCount) {
            await client.query(
              `INSERT INTO samples
                 (organization_id, load_id, harvest_id, source_id, unit_id, sample_code, sampled_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (organization_id, sample_code) DO NOTHING`,
              [batch.organization_id, value.loadId, batch.harvest_id, batch.source_id, batch.unit_id, value.sampleCode, value.measuredAt],
            )
            sample = await client.query(
              'SELECT id FROM samples WHERE organization_id=$1 AND unit_id=$2 AND sample_code=$3',
              [batch.organization_id, batch.unit_id, value.sampleCode],
            )
          }
          if (!sample.rowCount) throw new Error(`a amostra ${value.sampleCode} não pôde ser associada à usina do lote.`)
          const createdAnalysis = await client.query(
            `INSERT INTO quality_analyses (
               organization_id, sample_id, indicator_id, method_id, source_id, unit_id,
               valor_original, unidade_original, valor_normalizado, unidade_normalizada, regra_aplicada,
               versao_processamento, responsavel_ou_processo, measured_at, received_at, processed_at, released_at,
               validation_status, import_batch_id, source_row_number
             ) VALUES (
               $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16,'valid',$17,$18
             )
             RETURNING id`,
            [
              batch.organization_id, sample.rows[0].id, value.indicatorId, value.methodId, batch.source_id, batch.unit_id,
              value.originalValue, value.originalUnit, value.normalizedValue, value.normalizedUnit, value.ruleApplied,
              PROCESSING_VERSION, `import-batch:${batch.id}`, value.measuredAt, batch.received_at, finishedAt,
              batch.id, row.sourceRowNumber,
            ],
          )
          const dims = await ensureImportFactDimensions(client, batch, new Date(value.measuredAt))
          const indicator = await client.query(
            `SELECT i.name, u.symbol AS unit_symbol
             FROM indicator_definitions i
             LEFT JOIN unit_of_measure u ON u.organization_id=i.organization_id AND u.id=i.unit_of_measure_id
             WHERE i.organization_id=$1 AND i.id=$2`,
            [batch.organization_id, value.indicatorId],
          )
          const indicatorDim = await ensureDimension(
            client, batch.organization_id, 'dim_indicator', 'indicator_id', value.indicatorId,
            ['indicator_id', 'indicator_name', 'unit_symbol'], [value.indicatorId, indicator.rows[0].name, indicator.rows[0].unit_symbol],
          )
          const validationStatusDim = await ensureDimension(
            client, batch.organization_id, 'dim_validation_status', 'status_code', 'valid',
            ['status_code', 'status_label'], ['valid', 'Valid'],
          )
          let methodDim = null
          if (value.methodId) {
            const method = await client.query(
              'SELECT name, version FROM analytical_methods WHERE organization_id=$1 AND id=$2',
              [batch.organization_id, value.methodId],
            )
            methodDim = await ensureDimension(
              client, batch.organization_id, 'dim_method', 'method_id', value.methodId,
              ['method_id', 'method_name', 'method_version'], [value.methodId, method.rows[0].name, method.rows[0].version],
            )
          }
          await client.query(
            `INSERT INTO fact_samples_analyses (
               organization_id, quality_analysis_id, date_id, org_dim_id, unit_dim_id, harvest_dim_id,
               indicator_dim_id, source_dim_id, method_dim_id, validation_status_dim_id,
               value_normalized, measured_at, received_at, processed_at, released_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              batch.organization_id, createdAnalysis.rows[0].id, dims.date, dims.org, dims.unit,
              dims.harvest || null, indicatorDim, dims.source, methodDim, validationStatusDim,
              value.normalizedValue, value.measuredAt, batch.received_at, finishedAt, finishedAt,
            ],
          )
        }
      }
      const organization = await client.query('SELECT name FROM organizations WHERE id=$1', [batch.organization_id])
      const source = await client.query(
        'SELECT name, source_type FROM sources WHERE organization_id=$1 AND id=$2',
        [batch.organization_id, batch.source_id],
      )
      const unit = await client.query(
        'SELECT name FROM units WHERE organization_id=$1 AND id=$2',
        [batch.organization_id, batch.unit_id],
      )
      const receivedDate = new Date(batch.received_at)
      const calendarDate = receivedDate.toISOString().slice(0, 10)
      const dimOrgInsert = await client.query(
        `INSERT INTO dim_org (organization_id, org_code, org_name)
         VALUES ($1,$1,$2) ON CONFLICT (organization_id, org_code) DO NOTHING RETURNING id`,
        [batch.organization_id, organization.rows[0].name],
      )
      const dimOrg = dimOrgInsert.rows[0] || (await client.query(
        'SELECT id FROM dim_org WHERE organization_id=$1 AND org_code=$1',
        [batch.organization_id],
      )).rows[0]
      const dimUnitInsert = await client.query(
        `INSERT INTO dim_unit (organization_id, unit_id, unit_name)
         VALUES ($1,$2,$3) ON CONFLICT (organization_id, unit_id) DO NOTHING RETURNING id`,
        [batch.organization_id, batch.unit_id, unit.rows[0].name],
      )
      const dimUnit = dimUnitInsert.rows[0] || (await client.query(
        'SELECT id FROM dim_unit WHERE organization_id=$1 AND unit_id=$2',
        [batch.organization_id, batch.unit_id],
      )).rows[0]
      const dimSourceInsert = await client.query(
        `INSERT INTO dim_source (organization_id, source_id, source_name, source_type)
         VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id, source_id) DO NOTHING RETURNING id`,
        [batch.organization_id, batch.source_id, source.rows[0].name, source.rows[0].source_type],
      )
      const dimSource = dimSourceInsert.rows[0] || (await client.query(
        'SELECT id FROM dim_source WHERE organization_id=$1 AND source_id=$2',
        [batch.organization_id, batch.source_id],
      )).rows[0]
      const dimDateInsert = await client.query(
        `INSERT INTO dim_date (organization_id, calendar_date, year, month, day)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id, calendar_date) DO NOTHING RETURNING id`,
        [batch.organization_id, calendarDate, receivedDate.getUTCFullYear(), receivedDate.getUTCMonth() + 1, receivedDate.getUTCDate()],
      )
      const dimDate = dimDateInsert.rows[0] || (await client.query(
        'SELECT id FROM dim_date WHERE organization_id=$1 AND calendar_date=$2',
        [batch.organization_id, calendarDate],
      )).rows[0]
      await client.query(
        `INSERT INTO fact_imports_quality
           (organization_id, import_batch_id, date_id, org_dim_id, unit_dim_id, source_dim_id,
            received_count, accepted_count, rejected_count, suspect_count, pending_count, quality_metrics)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
        [
          batch.organization_id, batch.id, dimDate.id, dimOrg.id, dimUnit.id, dimSource.id,
          rows.length, qualityMetrics.queues.Aceitos, qualityMetrics.queues.Rejeitados,
          qualityMetrics.queues.Suspeitos, qualityMetrics.queues.Pendentes, JSON.stringify(qualityMetrics),
        ],
      )
      await client.query(
        `UPDATE import_batches
         SET status='processed', processed_at=$3, failure_message=NULL, quality_metrics=$4::jsonb
         WHERE id=$1 AND organization_id=$2`,
        [batch.id, batch.organization_id, finishedAt, JSON.stringify(qualityMetrics)],
      )
      await client.query(
        'UPDATE raw.import_jobs SET status=\'completed\', lease_until=NULL WHERE id=$1 AND organization_id=$2',
        [job.id, job.organization_id],
      )
    }, context)
  })
}

async function claimJob(db) {
  const result = await db.query(
    `UPDATE raw.import_jobs
     SET status='processing', attempts=attempts+1, lease_until=now() + interval '5 minutes'
     WHERE id=(
       SELECT id FROM raw.import_jobs
       WHERE (
         (status='queued' AND available_at <= now() AND attempts < $1)
         OR (status='processing' AND lease_until <= now())
       )
       ORDER BY id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, organization_id, import_batch_id, attempts`,
    [MAX_ATTEMPTS],
  )
  return result.rows[0] || null
}

async function failJob(db, job, cause) {
  const terminal = Number(job.attempts) >= MAX_ATTEMPTS
  const delaySeconds = Math.min(300, 2 ** Number(job.attempts))
  const context = systemContext(job.organization_id)
  await withSecurityContext(context, () => db.transaction(async (client) => {
    await client.query(
     `UPDATE raw.import_jobs
      SET status=$2, available_at=now() + ($3 * interval '1 second'), lease_until=NULL
      WHERE id=$1 AND organization_id=$4`,
     [job.id, terminal ? 'failed' : 'queued', delaySeconds, job.organization_id],
    )
    await client.query(
      `UPDATE import_batches
       SET status=$3, failure_message=$4
       WHERE id=$1 AND organization_id=$2`,
      [job.import_batch_id, job.organization_id, terminal ? 'failed' : 'queued', String(cause?.message || cause).slice(0, 1000)],
    )
  }, context))
  console.error(`Falha no lote de importação ${job.import_batch_id} (tentativa ${job.attempts}/${MAX_ATTEMPTS}):`, cause)
}

export function startImportWorker(db, { intervalMs = 1500 } = {}) {
  let active = false
  let idleWaiters = []
  const tick = async () => {
    if (active) return
    active = true
    try {
      const job = await claimJob(db)
      if (!job) return
      const heartbeat = setInterval(() => {
        db.query(
          `UPDATE raw.import_jobs SET lease_until=now() + interval '5 minutes'
           WHERE id=$1 AND organization_id=$2 AND status='processing'`,
          [job.id, job.organization_id],
        ).catch((cause) => console.error(`Falha ao renovar lease do lote ${job.import_batch_id}:`, cause))
      }, 60_000)
      heartbeat.unref()
      try {
        await processBatch(db, job)
      } catch (cause) {
        await failJob(db, job, cause)
      } finally {
        clearInterval(heartbeat)
      }
    } finally {
      active = false
      for (const resolve of idleWaiters) resolve()
      idleWaiters = []
    }
  }
  const timer = setInterval(() => tick().catch((cause) => console.error('Falha ao consultar fila de importação:', cause)), intervalMs)
  timer.unref()
  void tick().catch((cause) => console.error('Falha ao iniciar worker de importação:', cause))
  return () => {
    clearInterval(timer)
    if (!active) return Promise.resolve()
    return new Promise((resolve) => idleWaiters.push(resolve))
  }
}
