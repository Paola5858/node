import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAtrTonnes,
  calculateOperationalEfficiency,
  calculateTch,
  calculateWeightedAverage,
  catalogRows,
  excludeOperationalStops,
  isCompatibleMetricUnit,
  normalizeTonnes,
} from './metricEngine.js'

test('ATR calculations use associated-load tonnage as weights and preserve the specified scale', () => {
  const records = [
    { value: 100, tonnes: 10, sampleId: 1 },
    { value: 200, tonnes: 30, sampleId: 2 },
  ]
  assert.equal(calculateWeightedAverage(records).value, 175)
  assert.equal(calculateAtrTonnes(records).value, 7)
  assert.equal(calculateWeightedAverage([{ value: 100, tonnes: 0 }]).value, null)
  assert.equal(calculateWeightedAverage([{ value: null, tonnes: 10 }]).value, null)
})

test('tonnage conversion requires an explicit recognized unit', () => {
  assert.equal(normalizeTonnes(2500, 'kg'), 2.5)
  assert.equal(normalizeTonnes(2.5, 't'), 2.5)
  assert.equal(normalizeTonnes(2500, null), null)
  assert.equal(normalizeTonnes(null, 't'), null)
  assert.equal(isCompatibleMetricUnit('ATR_WEIGHTED', 'kg ATR/t cana'), true)
  assert.equal(isCompatibleMetricUnit('ATR_WEIGHTED', '%'), false)
})

test('TCH requires compatible production and area by plot and harvest', () => {
  const valid = [
    { plotId: 1, harvestId: 3, harvestedTonnes: 100, harvestedHectares: 2 },
    { plotId: 1, harvestId: 3, harvestedTonnes: 50, harvestedHectares: 2 },
  ]
  assert.equal(calculateTch(valid).value, 75)
  assert.equal(calculateTch([
    { plotId: 1, harvestId: 3, harvestedTonnes: 0, harvestedHectares: 2 },
  ]).value, 0)
  assert.equal(calculateTch([{ plotId: 1, harvestId: 3, harvestedTonnes: 100 }]).value, null)
  assert.equal(calculateTch([
    ...valid,
    { plotId: 1, harvestId: 3, harvestedTonnes: 10, harvestedHectares: 3 },
  ]).reason, 'incompatible_harvest_area')
})

test('operational stoppages are excluded instead of depressing operating efficiency', () => {
  const result = excludeOperationalStops([
    { id: 1, rate: 10, operationalStop: false },
    { id: 2, rate: 0, operationalStop: true },
    { id: 3, rate: 30, operationalStop: null },
  ])
  assert.deepEqual(result.included.map((row) => row.id), [1])
  assert.deepEqual(result.excluded.map((row) => row.reason), ['operational_stop', 'stoppage_status_unknown'])
  const efficiency = calculateOperationalEfficiency([
    { rate: 20, throughputTonnes: 2, operationalStop: false },
    { rate: 0, throughputTonnes: 10, operationalStop: true },
  ])
  assert.equal(efficiency.value, 20)
})

test('catalog includes required quality and future industrial/economic domains', () => {
  const codes = new Set(catalogRows('homologator').map((row) => row.code))
  for (const code of [
    'RECEIVED_TONNES', 'LOAD_COUNT', 'ATR_WEIGHTED', 'BRIX_WEIGHTED', 'POL_WEIGHTED',
    'PURITY_WEIGHTED', 'FIBER_WEIGHTED', 'AR_WEIGHTED', 'VEGETAL_IMPURITY_WEIGHTED',
    'MINERAL_IMPURITY_WEIGHTED', 'TCH', 'HARVESTED_AREA_HA', 'ATR_TONNES',
    'PLAN_EXECUTION_PCT', 'LOGISTICS_CYCLE_MINUTES', 'PROCESS_LOSSES_TONNES',
    'DATA_SAMPLE_COVERAGE_PCT', 'INDUSTRIAL_EXTRACTION_PCT', 'ECONOMIC_COST_PER_TONNE',
  ]) assert.ok(codes.has(code), `${code} is catalogued`)
})
