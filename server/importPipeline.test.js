import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  parseImportFile,
  parseMeasuredAt,
  parseNumeric,
  suggestColumnMapping,
  validateColumnMapping,
} from './importPipeline.js'
import { normalizeImportedValue, validateImportRows, validateTargetImportRows } from './importWorker.js'

test('CSV parser preserves quoted delimiters and embedded newlines', async () => {
  const csv = Buffer.from('DATA_HORA;EQUIPAMENTO;INDICADOR;VALOR;UNIDADE\n2026-02-01T10:00:00Z;"Extrator; A";BRIX_CALDO;19,45;°Bx\n2026-02-01T10:30:00Z;"Linha\nLaboratório";UMIDADE_LAB;0.089;fração decimal')
  const result = await parseImportFile(csv, 'medicoes.csv')

  assert.deepEqual(result.headers, ['DATA_HORA', 'EQUIPAMENTO', 'INDICADOR', 'VALOR', 'UNIDADE'])
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[0].raw.EQUIPAMENTO, 'Extrator; A')
  assert.equal(result.rows[1].raw.EQUIPAMENTO, 'Linha\nLaboratório')
  assert.equal(result.rows[1].raw.VALOR, '0.089')
})

test('XLSX parser exposes sheet choices and reads only the selected sheet', async () => {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Medições').addRows([
    ['Indicador', 'Valor'],
    ['BRIX', 19.5],
  ])
  workbook.addWorksheet('Ignorar').addRows([['Outro'], ['conteúdo']])
  const bytes = Buffer.from(await workbook.xlsx.writeBuffer())

  const result = await parseImportFile(bytes, 'entrada.xlsx', 'Medições')
  assert.deepEqual(result.sheetNames, ['Medições', 'Ignorar'])
  assert.equal(result.selectedSheet, 'Medições')
  assert.equal(result.rows[0].raw.Valor, '19.5')
})

test('mapping suggestions match accented headers and reject invalid required mappings', async () => {
  const document = await parseImportFile(
    Buffer.from('DATA_HORA;EQUIPAMENTO;INDICADOR;VALOR;UNIDADE\n2026-01-01T00:00:00Z;Balança;UMIDADE_LAB;0.089;fração decimal'),
    'arquivo.csv',
  )
  const mapping = suggestColumnMapping(document.headers)
  assert.deepEqual(mapping, {
    measured_at: 'DATA_HORA',
    equipment: 'EQUIPAMENTO',
    indicator: 'INDICADOR',
    value: 'VALOR',
    unit_of_measure: 'UNIDADE',
    event_id: '',
    sync_status: '',
  })
  assert.equal(validateColumnMapping(mapping, document.headers), null)
  assert.match(validateColumnMapping({ ...mapping, equipment: '' }, document.headers), /equipment/)
})

test('numeric and timestamp parsing handles Brazilian input and invalid dates', () => {
  assert.equal(parseNumeric('1.234,56'), 1234.56)
  assert.equal(parseNumeric('19,45'), 19.45)
  assert.equal(parseNumeric('abc'), null)
  assert.equal(parseMeasuredAt('31/12/2025 23:59')?.toISOString(), '2025-12-31T23:59:00.000Z')
  assert.equal(parseMeasuredAt('31/02/2025'), null)
})

test('UMIDADE_LAB fraction is converted once while percent values remain unchanged', () => {
  assert.deepEqual(normalizeImportedValue('UMIDADE_LAB', 0.089, 'fração decimal'), {
    value: 8.9,
    unit: '%',
    ruleApplied: 'UMIDADE_LAB:fraction_to_percent:v1',
    isFractionalMoisture: true,
    error: null,
  })
  assert.equal(normalizeImportedValue('UMIDADE_LAB', 0.089, '%').value, 0.089)
  assert.ok(normalizeImportedValue('UMIDADE_LAB', 1.2, 'fração decimal').error)
})

test('server validation assigns each row to exactly one exclusive queue', async () => {
  const measuredAt = new Date(Date.now() - 60_000).toISOString()
  const secondMeasuredAt = new Date(new Date(measuredAt).getTime() + 30_000).toISOString()
  const csv = Buffer.from([
    'DATA;EQUIPAMENTO;INDICADOR;VALOR;UNIDADE',
    `${measuredAt};Balança 1;BRIX;19.5;°Bx`,
    `${measuredAt};Balança 1;BRIX;inválido;°Bx`,
    `${secondMeasuredAt};Balança 1;BRIX;20;unidade desconhecida`,
    `${measuredAt} ; ;BRIX;21;°Bx`,
    `${measuredAt};Balança 1;BRIX;19.5;°Bx`,
  ].join('\n'))
  const document = await parseImportFile(csv, 'medicoes.csv')
  const batch = {
    source_id: 1,
    mapping_json: {
      measured_at: 'DATA',
      equipment: 'EQUIPAMENTO',
      indicator: 'INDICADOR',
      value: 'VALOR',
      unit_of_measure: 'UNIDADE',
      event_id: '',
      sync_status: '',
    },
  }
  const references = {
    equipment: new Map([['balanca 1', [{ id: 2, name: 'Balança 1' }]]]),
    indicators: new Map([['brix', [{ id: 3, name: 'BRIX', unit_symbol: '°Bx' }]]]),
    units: new Set(['°bx']),
    rules: [],
  }

  const result = validateImportRows(document, batch, references, new Date(), [])
  assert.deepEqual(result.rows.map((row) => row.queue), ['Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes', 'Suspeitos'])
  assert.equal(result.rows.length, Object.values(result.qualityMetrics.queues).reduce((sum, count) => sum + count, 0))
  assert.equal(result.qualityMetrics.duplication.duplicateRows, 1)
  assert.equal(result.qualityMetrics.recognizedUnits.percent, 80)
})

test('load import preserves distinct loads that have the same weight', async () => {
  const weighedAt = new Date(Date.now() - 60_000).toISOString()
  const document = await parseImportFile(Buffer.from([
    'REFERENCIA;DATA_PESAGEM;PESO_BRUTO;TARA',
    `CARGA-100;${weighedAt};50;10`,
    `CARGA-101;${weighedAt};50;10`,
    `CARGA-100;${weighedAt};50;10`,
  ].join('\n')), 'cargas.csv')
  const mapping = suggestColumnMapping(document.headers, 'loads')
  const result = validateTargetImportRows(
    document,
    { entity_type: 'loads', source_id: 1, unit_id: 2, mapping_json: mapping },
    { loads: new Map(), suppliers: new Map(), farms: new Map(), plots: new Map(), fronts: new Map() },
    new Date(),
  )

  assert.deepEqual(result.rows.map((row) => row.queue), ['Aceitos', 'Aceitos', 'Suspeitos'])
  assert.equal(result.qualityMetrics.duplication.duplicateRows, 1)
  assert.equal(result.rows[0].normalizedPayload.grossWeight, result.rows[1].normalizedPayload.grossWeight)
  assert.notEqual(result.rows[0].normalizedPayload.externalReference, result.rows[1].normalizedPayload.externalReference)
})

test('quality analysis import checks references, scale and cross-source reconciliation', async () => {
  const measuredAt = new Date(Date.now() - 60_000).toISOString()
  const document = await parseImportFile(Buffer.from([
    'AMOSTRA;INDICADOR;DATA_COLETA;VALOR;UNIDADE;METODO',
    `A-1;UMIDADE_LAB;${measuredAt};21;%;Padrão`,
    `A-2;UMIDADE_LAB;${measuredAt};12;%;Padrão`,
    `A-3;UMIDADE_LAB;${measuredAt};12;%;`,
  ].join('\n')), 'analises.csv')
  const mapping = suggestColumnMapping(document.headers, 'quality_analyses')
  const result = validateTargetImportRows(
    document,
    { entity_type: 'quality_analyses', source_id: 1, unit_id: 2, mapping_json: mapping },
    {
      indicators: new Map([['umidade_lab', [{ id: 8, name: 'UMIDADE_LAB', unit_symbol: '%' }]]]),
      units: new Set(['%']),
      methods: new Map([['padrao', [{ id: 9, name: 'Padrão' }]]]),
      loads: new Map(),
      samples: new Map(),
      rules: [{ indicator_id: 8, minimum_value: 0, maximum_value: 20, name: 'Faixa', version: 'v1' }],
    },
    new Date(),
    [{ sample_code: 'A-1', indicator_id: 8, measured_at: measuredAt, source_id: 2, valor_normalizado: 20 }],
  )

  assert.deepEqual(result.rows.map((row) => row.queue), ['Suspeitos', 'Aceitos', 'Pendentes'])
  assert.ok(result.rows[0].issues.some((issue) => issue.category === 'source_reconciliation'))
  assert.ok(result.rows[0].issues.some((issue) => issue.category === 'technical_range'))
  assert.equal(result.rows[1].normalizedPayload.normalizedValue, 12)
})
