import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasFrontScope, hasPermission, hasUnitScope, isOperationalOrIntern } from './authorization.js'

test('authorization enforces department, operational privilege limits, and unit/front scopes', () => {
  const operator = {
    department: 'laboratorio',
    accessLevel: 'operational',
    roleNames: ['operational'],
    permissionCodes: ['quality:can_read', 'quality:can_approve_release', 'units:can_read'],
    allowedUnitIds: ['12'],
    allowedFrontIds: ['34'],
  }

  assert.equal(hasPermission(operator, 'quality', 'can_read'), true)
  assert.equal(hasPermission(operator, 'units', 'can_read'), true)
  assert.equal(isOperationalOrIntern(operator), true)
  assert.equal(hasUnitScope(operator, 12), true)
  assert.equal(hasUnitScope(operator, 13), false)
  assert.equal(hasFrontScope(operator, 34), true)
  assert.equal(hasFrontScope(operator, 35), false)
})

test('intern role remains operational even if a misconfigured access level is elevated', () => {
  assert.equal(isOperationalOrIntern({
    accessLevel: 'tactical',
    roleNames: ['intern'],
  }), true)
})
