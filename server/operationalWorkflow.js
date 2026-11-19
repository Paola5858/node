export const occurrenceWorkflow = {
  open: { label: 'Aberta', next: 'in_analysis' },
  in_analysis: { label: 'Em Análise', next: 'action_defined' },
  action_defined: { label: 'Ação Definida', next: 'executed' },
  executed: { label: 'Executada', next: 'verified' },
  verified: { label: 'Verificada', next: null },
}

export const recordStateValues = {
  operationalCondition: ['normal', 'attention', 'stopped', 'unknown'],
  dataCondition: ['validado', 'atenção', 'inválido', 'pendente'],
  attentionPriority: ['none', 'low', 'medium', 'high', 'critical'],
  investigationStatus: ['not_started', ...Object.keys(occurrenceWorkflow)],
  releaseStatus: ['normal', 'authorized_exception', 'blocked', 'pending'],
}

export function isValidOccurrenceTransition(current, next) {
  return occurrenceWorkflow[current]?.next === next
}

export function parseOccurrenceEvidence(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) return null
  const allowed = value.every((item) => item && typeof item === 'object' && (
    (item.type === 'kpi' && typeof item.metricCode === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(item.metricCode)) ||
    (item.type === 'load' && Number.isSafeInteger(Number(item.loadId)) && Number(item.loadId) > 0) ||
    (item.type === 'sample' && Number.isSafeInteger(Number(item.sampleId)) && Number(item.sampleId) > 0)
  ))
  return allowed ? value : null
}
