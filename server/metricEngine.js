export const metricDefinitions = [
  ['RECEIVED_TONNES', 'Toneladas recebidas', 'volume', 't', 'load', 'sum', ['load.net_weight', 'load.weight_unit'], 'Soma de toneladas líquidas de cargas recebidas.', 'higher_is_better', 'Pesagens de cargas vinculadas a unidade e safra.'],
  ['DELIVERED_TONNES', 'Toneladas entregues', 'volume', 't', 'load', 'sum', ['load.net_weight', 'load.weight_unit'], 'Soma de toneladas líquidas entregues.', 'higher_is_better', 'Pesagens de cargas com destino confirmado.'],
  ['LOAD_COUNT', 'Cargas recebidas', 'volume', 'cargas', 'load', 'count', ['load.external_reference', 'load.weighed_at'], 'Contagem de cargas com referência única.', 'higher_is_better', 'Registros operacionais de pesagem.'],
  ['ATR_WEIGHTED', 'ATR ponderado', 'quality', 'kg ATR/t cana', 'sample-load', 'weighted_average', ['quality_analysis.atr', 'sample.load_id', 'load.net_weight', 'load.weight_unit'], 'SUM(ATR_i * Toneladas_i) / SUM(Toneladas_i)', 'higher_is_better', 'ATR Consecana por análise de amostra associada à carga pesável.'],
  ['BRIX_WEIGHTED', 'Brix ponderado', 'quality', '°Bx', 'sample-load', 'weighted_average', ['quality_analysis.brix', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'context_dependent', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['POL_WEIGHTED', 'Pol ponderado', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.pol', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'context_dependent', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['PURITY_WEIGHTED', 'Pureza ponderada', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.purity', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'context_dependent', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['FIBER_WEIGHTED', 'Fibra ponderada', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.fiber', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'context_dependent', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['AR_WEIGHTED', 'Açúcares redutores ponderados', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.ar', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'lower_is_better', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['VEGETAL_IMPURITY_WEIGHTED', 'Impureza vegetal ponderada', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.vegetal_impurity', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'lower_is_better', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['MINERAL_IMPURITY_WEIGHTED', 'Impureza mineral ponderada', 'quality', '%', 'sample-load', 'weighted_average', ['quality_analysis.mineral_impurity', 'sample.load_id', 'load.net_weight'], 'Média ponderada pelo peso líquido das cargas associadas às amostras.', 'lower_is_better', 'Análises laboratoriais vinculadas a amostras e cargas.'],
  ['TCH', 'Toneladas de cana por hectare', 'productivity', 't/ha', 'plot-harvest', 'ratio', ['harvested_tonnes.plot_id', 'harvested_tonnes.harvest_id', 'harvested_area.hectares'], 'Toneladas_Colhidas / Hectares_Colhidos, para talhão e safra compatíveis.', 'higher_is_better', 'Produção colhida e área colhida conciliadas por talhão e safra.'],
  ['HARVESTED_AREA_HA', 'Área colhida', 'productivity', 'ha', 'plot-harvest', 'sum', ['harvested_area.plot_id', 'harvested_area.harvest_id', 'harvested_area.hectares'], 'Soma da área efetivamente colhida por talhão e safra.', 'higher_is_better', 'Apontamentos de área colhida conciliados por talhão e safra.'],
  ['ATR_TONNES', 'Toneladas de ATR', 'recoverable_sugar', 't ATR', 'sample-load', 'sum_weighted_value_div_1000', ['quality_analysis.atr', 'sample.load_id', 'load.net_weight', 'load.weight_unit'], 'SUM(ATR_i * Toneladas_i) / 1000', 'higher_is_better', 'ATR Consecana por análise de amostra associada à carga pesável.'],
  ['PLAN_EXECUTION_PCT', 'Execução do plano', 'execution', '%', 'unit-day', 'actual_div_plan', ['actual.value', 'plan.value'], 'Realizado / Plano * 100; valores ausentes não são zero.', 'context_dependent', 'Realizado e plano versionado para a mesma unidade e período.'],
  ['LOGISTICS_CYCLE_MINUTES', 'Tempo de ciclo logístico', 'logistics', 'min', 'load', 'duration', ['load.arrived_at', 'load.departed_at'], 'Duração entre eventos de chegada e saída da mesma carga.', 'lower_is_better', 'Eventos de ciclo logístico com referência de carga conciliada.'],
  ['PROCESS_LOSSES_TONNES', 'Perdas de processo', 'losses', 't', 'unit-period', 'sum', ['loss.value', 'loss.unit'], 'Soma de perdas medidas e classificadas no período.', 'lower_is_better', 'Registros de perdas industriais validados.'],
  ['DATA_SAMPLE_COVERAGE_PCT', 'Cobertura de amostras', 'data_quality', '%', 'sample-period', 'coverage', ['sample.expected_count', 'sample.valid_count'], 'Amostras válidas / amostras esperadas * 100.', 'higher_is_better', 'Plano de amostragem e análises válidas.'],
  ['DATA_LOAD_COVERAGE_PCT', 'Cobertura de toneladas', 'data_quality', '%', 'load-period', 'coverage', ['load.expected_tonnes', 'load.sampled_tonnes'], 'Toneladas com amostra válida / toneladas elegíveis * 100.', 'higher_is_better', 'Pesagens e análises vinculadas por carga.'],
  ['INDUSTRIAL_EXTRACTION_PCT', 'Extração industrial', 'industrial', '%', 'unit-period', 'weighted_average', ['industrial.extraction', 'industrial.throughput'], 'Cálculo ponderado pela moagem efetiva, excluindo paradas.', 'context_dependent', 'Medições industriais conciliadas com moagem e paradas.'],
  ['INDUSTRIAL_STEAM_TONNES_PER_TONNE', 'Consumo específico de vapor', 'industrial', 't/t cana', 'unit-period', 'ratio', ['industrial.steam_tonnes', 'industrial.cane_tonnes'], 'Vapor total / cana moída; paradas operacionais são isoladas.', 'lower_is_better', 'Medições industriais de vapor e moagem conciliadas.'],
  ['ECONOMIC_COST_PER_TONNE', 'Custo por tonelada', 'economic', 'moeda/t', 'unit-period', 'ratio', ['economic.cost', 'production.tonnes'], 'Custo elegível / produção compatível no mesmo período.', 'lower_is_better', 'Custos conciliados e produção do mesmo escopo.'],
]

const aliasesByCode = {
  ATR_WEIGHTED: ['atr', 'atr ponderado', 'atr (kg/t)', 'açúcar total recuperável'],
  ATR_TONNES: ['atr', 'atr ponderado', 'atr (kg/t)', 'açúcar total recuperável'],
  BRIX_WEIGHTED: ['brix', '°bx', 'brix caldo'],
  POL_WEIGHTED: ['pol', 'pol caldo'],
  PURITY_WEIGHTED: ['pureza', 'purity'],
  FIBER_WEIGHTED: ['fibra', 'fiber'],
  AR_WEIGHTED: ['ar', 'açúcares redutores', 'acucares redutores'],
  VEGETAL_IMPURITY_WEIGHTED: ['impureza vegetal', 'vegetal impurity'],
  MINERAL_IMPURITY_WEIGHTED: ['impureza mineral', 'mineral impurity'],
}

const compatibleUnitsByCode = {
  ATR_WEIGHTED: ['kg/t', 'kg atr/t', 'kg atr/t cana', 'kgatr/t', 'kg/t cana'],
  ATR_TONNES: ['kg/t', 'kg atr/t', 'kg atr/t cana', 'kgatr/t', 'kg/t cana'],
  BRIX_WEIGHTED: ['°bx', 'bx'],
  POL_WEIGHTED: ['%', 'pol'],
  PURITY_WEIGHTED: ['%', 'pureza'],
  FIBER_WEIGHTED: ['%', 'fibra'],
  AR_WEIGHTED: ['%', 'ar'],
  VEGETAL_IMPURITY_WEIGHTED: ['%', 'impureza vegetal'],
  MINERAL_IMPURITY_WEIGHTED: ['%', 'impureza mineral'],
}

function normalizedUnit(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function catalogRows(userId, validFrom = new Date().toISOString().slice(0, 10)) {
  return metricDefinitions.map(([code, name, category, unit, granularity, aggregation, requiredFields, formula, direction, technicalSource]) => ({
    code,
    name,
    category,
    unit,
    granularity,
    aggregation,
    requiredFields,
    formula,
    direction,
    technicalSource,
    validFrom,
    version: '1.0.0',
    homologatedBy: userId,
    aliases: aliasesByCode[code] || [],
  }))
}

export function normalizeTonnes(netWeight, weightUnit) {
  const value = Number(netWeight)
  if (!Number.isFinite(value) || value <= 0) return null
  const unit = String(weightUnit || '').trim().toLowerCase()
  if (['t', 'ton', 'tonne', 'tonnes', 'tonelada', 'toneladas'].includes(unit)) return value
  if (['kg', 'quilograma', 'quilogramas'].includes(unit)) return value / 1000
  return null
}

export function calculateWeightedAverage(records) {
  const eligible = records.filter((row) =>
    row.value !== null && row.value !== undefined && row.value !== '' &&
    row.tonnes !== null && row.tonnes !== undefined && row.tonnes !== '' &&
    Number.isFinite(Number(row.value)) && Number.isFinite(Number(row.tonnes)) && Number(row.tonnes) > 0)
  const totalTonnes = eligible.reduce((sum, row) => sum + Number(row.tonnes), 0)
  if (!eligible.length || totalTonnes <= 0) return { value: null, reason: 'insufficient_weighted_records' }
  return {
    value: eligible.reduce((sum, row) => sum + Number(row.value) * Number(row.tonnes), 0) / totalTonnes,
    included: eligible,
    totalTonnes,
  }
}

export function calculateAtrTonnes(records) {
  const average = calculateWeightedAverage(records)
  if (average.value === null) return average
  return {
    value: records
      .filter((row) => Number.isFinite(Number(row.value)) && Number.isFinite(Number(row.tonnes)) && Number(row.tonnes) > 0)
      .reduce((sum, row) => sum + Number(row.value) * Number(row.tonnes), 0) / 1000,
    included: average.included,
    totalTonnes: average.totalTonnes,
  }
}

export function calculateTch(records) {
  const eligible = records.filter((row) =>
    row.plotId != null && row.harvestId != null &&
    row.harvestedTonnes !== null && row.harvestedTonnes !== undefined && row.harvestedTonnes !== '' &&
    row.harvestedHectares !== null && row.harvestedHectares !== undefined && row.harvestedHectares !== '' &&
    Number.isFinite(Number(row.harvestedTonnes)) && Number(row.harvestedTonnes) >= 0 &&
    Number.isFinite(Number(row.harvestedHectares)) && Number(row.harvestedHectares) > 0)
  const excluded = records.filter((row) => !eligible.includes(row))
  const groups = new Map()
  for (const row of eligible) {
    const key = `${row.harvestId}:${row.plotId}`
    const group = groups.get(key) || { tonnes: 0, hectares: null }
    if (group.hectares !== null && group.hectares !== Number(row.harvestedHectares)) {
      return { value: null, reason: 'incompatible_harvest_area', included: [], excluded: records }
    }
    group.tonnes += Number(row.harvestedTonnes)
    group.hectares = Number(row.harvestedHectares)
    groups.set(key, group)
  }
  const tonnes = [...groups.values()].reduce((sum, row) => sum + row.tonnes, 0)
  const hectares = [...groups.values()].reduce((sum, row) => sum + row.hectares, 0)
  if (!groups.size || tonnes < 0 || hectares <= 0) return { value: null, reason: 'missing_compatible_production_area', included: [], excluded }
  return { value: tonnes / hectares, included: eligible, excluded }
}

export function excludeOperationalStops(records) {
  const included = records.filter((row) => row.operationalStop === false)
  const excluded = records
    .filter((row) => row.operationalStop !== false)
    .map((row) => ({
      ...row,
      reason: row.operationalStop === true ? 'operational_stop' : 'stoppage_status_unknown',
    }))
  return { included, excluded }
}

export function calculateOperationalEfficiency(records) {
  const separated = excludeOperationalStops(records)
  const weighted = calculateWeightedAverage(
    separated.included.map((row) => ({ value: row.rate, tonnes: row.throughputTonnes })),
  )
  return {
    value: weighted.value,
    included: weighted.included || [],
    excluded: separated.excluded,
    reason: weighted.reason || null,
  }
}

export function aliasesForMetric(code) {
  return aliasesByCode[code] || []
}

export function isCompatibleMetricUnit(code, unit) {
  return (compatibleUnitsByCode[code] || []).includes(normalizedUnit(unit))
}
