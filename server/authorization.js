const modules = [
  'units', 'harvests', 'equipment', 'measurements', 'quality', 'rules',
  'periods', 'imports', 'analytics', 'users', 'reports', 'occurrences', 'catalogs',
]
const actions = ['can_read', 'can_write', 'can_approve_release', 'can_homologate_rules', 'can_export']
const scopedReadModules = [
  'units', 'harvests', 'equipment', 'measurements', 'quality', 'imports',
  'analytics', 'reports', 'occurrences', 'catalogs',
]
const scopedWriteModules = [
  'units', 'harvests', 'equipment', 'measurements', 'quality', 'imports', 'occurrences', 'catalogs',
]
const departmentModules = {
  qualidade: ['units', 'harvests', 'equipment', 'quality', 'measurements', 'rules', 'imports', 'analytics', 'reports', 'periods', 'catalogs'],
  laboratorio: ['units', 'harvests', 'equipment', 'quality', 'measurements', 'imports', 'analytics', 'reports', 'catalogs'],
  agricola: ['units', 'harvests', 'equipment', 'imports', 'analytics', 'reports', 'occurrences', 'periods', 'catalogs'],
  industrial: ['units', 'harvests', 'equipment', 'measurements', 'quality', 'imports', 'analytics', 'reports', 'occurrences', 'periods', 'catalogs'],
  ti: modules,
}

export async function provisionOrganizationAuthorization(client, organizationId, userId) {
  await client.query(
    'INSERT INTO roles (organization_id, name) SELECT $1, roles.name FROM unnest($2::text[]) AS roles(name) ON CONFLICT (organization_id, name) DO NOTHING',
    [organizationId, ['organization_admin', 'strategic', 'tactical', 'operational', 'intern']],
  )
  await client.query(
    `INSERT INTO permissions (organization_id, code, module, action, description)
     SELECT $1, module || ':' || action, module, action, module || ' / ' || action
     FROM unnest($2::text[]) AS module_values(module)
     CROSS JOIN unnest($3::text[]) AS action_values(action)
     ON CONFLICT (organization_id, module, action) DO NOTHING`,
    [organizationId, modules, actions],
  )
  const grants = []
  for (const role of ['organization_admin', 'strategic']) {
    for (const module of modules) for (const action of actions) grants.push({ role, module, action })
  }
  for (const module of modules) {
    for (const action of actions) {
      if (module !== 'users' || action !== 'can_write') grants.push({ role: 'tactical', module, action })
    }
  }
  for (const module of scopedReadModules) grants.push({ role: 'operational', module, action: 'can_read' })
  for (const module of scopedWriteModules) grants.push({ role: 'operational', module, action: 'can_write' })
  for (const module of scopedReadModules) grants.push({ role: 'intern', module, action: 'can_read' })
  await client.query(
    `INSERT INTO role_permissions (organization_id, role_id, permission_id)
     SELECT $1, roles.id, permissions.id
     FROM jsonb_to_recordset($2::jsonb) AS grant_row(role text, module text, action text)
     JOIN roles ON roles.organization_id = $1 AND roles.name = grant_row.role
     JOIN permissions ON permissions.organization_id = $1
       AND permissions.module = grant_row.module AND permissions.action = grant_row.action
     ON CONFLICT DO NOTHING`,
    [organizationId, JSON.stringify(grants)],
  )
  await client.query(
    `INSERT INTO user_roles (organization_id, user_id, role_id)
     SELECT $1, $2, id FROM roles
     WHERE organization_id = $1 AND name = 'organization_admin'
     ON CONFLICT DO NOTHING`,
    [organizationId, userId],
  )
}

export async function resolveSecurityContext(db, user) {
  const context = {
    organizationId: user.organization_id,
    userId: user.id,
    allowedUnitIds: [],
    permissionCodes: [],
    accessLevel: user.access_level || 'operational',
  }
  const result = await db.query(
    `SELECT u.department, u.access_level,
      ARRAY(SELECT s.unit_id::text FROM user_unit_scope s
        WHERE s.organization_id = u.organization_id AND s.user_id = u.id ORDER BY s.unit_id) AS unit_ids,
      ARRAY(SELECT s.front_id::text FROM user_front_scope s
        WHERE s.organization_id = u.organization_id AND s.user_id = u.id ORDER BY s.front_id) AS front_ids,
      ARRAY(SELECT DISTINCT p.code
        FROM user_roles ur
        JOIN role_permissions rp ON rp.organization_id = ur.organization_id AND rp.role_id = ur.role_id
        JOIN permissions p ON p.organization_id = rp.organization_id AND p.id = rp.permission_id
        WHERE ur.organization_id = u.organization_id AND ur.user_id = u.id
        ORDER BY p.code) AS permission_codes,
      ARRAY(SELECT r.name
        FROM user_roles ur JOIN roles r
          ON r.organization_id = ur.organization_id AND r.id = ur.role_id
        WHERE ur.organization_id = u.organization_id AND ur.user_id = u.id
        ORDER BY r.name) AS role_names
     FROM users u
     WHERE u.organization_id = $1 AND u.id = $2`,
    [user.organization_id, user.id],
    context,
  )
  if (!result.rowCount) throw new Error('O contexto organizacional do usuário não está disponível.')
  const row = result.rows[0]
  context.department = row.department
  context.accessLevel = row.access_level
  context.allowedUnitIds = row.access_level === 'strategic' ? ['*'] : row.unit_ids
  context.allowedFrontIds = row.access_level === 'strategic' ? ['*'] : row.front_ids
  context.permissionCodes = row.permission_codes
  context.roleNames = row.role_names
  context.department = row.department
  return context
}

export function hasPermission(context, module, action) {
  return context.permissionCodes.includes(`${module}:${action}`)
    && (isStrategicAdmin(context) || (departmentModules[context.department] || []).includes(module))
}

export function isStrategicAdmin(context) {
  return context.roleNames.includes('organization_admin')
}

export const accessRoles = {
  organization_admin: 'strategic',
  strategic: 'strategic',
  tactical: 'tactical',
  operational: 'operational',
  intern: 'operational',
}

export function isOperationalOrIntern(context) {
  return context.accessLevel === 'operational' || context.roleNames.includes('intern')
}

export function hasUnitScope(context, unitId) {
  return context.allowedUnitIds.includes('*') || context.allowedUnitIds.includes(String(unitId))
}

export function hasFrontScope(context, frontId) {
  return context.allowedFrontIds.includes('*') || context.allowedFrontIds.includes(String(frontId))
}
