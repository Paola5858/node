import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidOccurrenceTransition,
  occurrenceWorkflow,
  parseOccurrenceEvidence,
  recordStateValues,
} from './operationalWorkflow.js'

test('occurrence workflow only allows sequential transitions through verification', () => {
  assert.equal(isValidOccurrenceTransition('open', 'in_analysis'), true)
  assert.equal(isValidOccurrenceTransition('in_analysis', 'action_defined'), true)
  assert.equal(isValidOccurrenceTransition('action_defined', 'executed'), true)
  assert.equal(isValidOccurrenceTransition('executed', 'verified'), true)
  assert.equal(isValidOccurrenceTransition('open', 'verified'), false)
  assert.equal(isValidOccurrenceTransition('verified', 'open'), false)
  assert.equal(occurrenceWorkflow.verified.next, null)
})

test('independent record state dimensions expose only their approved values', () => {
  assert.deepEqual(recordStateValues.dataCondition, ['validado', 'atenção', 'inválido', 'pendente'])
  assert.ok(recordStateValues.releaseStatus.includes('authorized_exception'))
  assert.ok(recordStateValues.operationalCondition.includes('stopped'))
})

test('occurrence evidence requires one valid KPI, load, or sample reference', () => {
  assert.deepEqual(parseOccurrenceEvidence([{ type: 'load', loadId: 7 }]), [{ type: 'load', loadId: 7 }])
  assert.equal(parseOccurrenceEvidence([]), null)
  assert.equal(parseOccurrenceEvidence([{ type: 'load', loadId: -1 }]), null)
  assert.equal(parseOccurrenceEvidence([{ type: 'kpi', metricCode: 'bad-code' }]), null)
})
