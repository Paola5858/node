SET LOCAL search_path = public, pg_catalog;

ALTER TABLE operational.users
  ADD COLUMN department text NOT NULL DEFAULT 'industrial'
    CHECK (department IN ('qualidade', 'laboratorio', 'agricola', 'industrial', 'ti')),
  ADD COLUMN access_level text NOT NULL DEFAULT 'operational'
    CHECK (access_level IN ('operational', 'tactical', 'strategic'));
UPDATE operational.users
SET department = CASE WHEN role = 'owner' THEN 'ti' ELSE 'industrial' END,
    access_level = CASE WHEN role = 'owner' THEN 'strategic' ELSE 'operational' END;

ALTER TABLE operational.permissions
  ADD COLUMN module text NOT NULL DEFAULT 'legacy',
  ADD COLUMN action text NOT NULL DEFAULT 'can_read'
    CHECK (action IN ('can_read', 'can_write', 'can_approve_release', 'can_homologate_rules', 'can_export'));
ALTER TABLE operational.permissions NO FORCE ROW LEVEL SECURITY;
UPDATE operational.permissions
SET module = 'legacy_' || id::text
WHERE module = 'legacy';
ALTER TABLE operational.permissions
  ADD CONSTRAINT permissions_org_module_action UNIQUE (organization_id, module, action);
ALTER TABLE operational.permissions ALTER COLUMN module DROP DEFAULT;
ALTER TABLE operational.permissions ALTER COLUMN action DROP DEFAULT;

CREATE TABLE operational.user_unit_scope (
  organization_id text NOT NULL,
  user_id text NOT NULL,
  unit_id bigint NOT NULL,
  assigned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, unit_id),
  FOREIGN KEY (organization_id) REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, user_id) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, assigned_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE operational.user_front_scope (
  organization_id text NOT NULL,
  user_id text NOT NULL,
  front_id bigint NOT NULL,
  assigned_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, front_id),
  FOREIGN KEY (organization_id) REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, user_id) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, front_id) REFERENCES operational.fronts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, assigned_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);

ALTER TABLE operational.harvests ADD COLUMN unit_id bigint;
ALTER TABLE operational.harvests ADD CONSTRAINT harvests_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.farms ADD COLUMN unit_id bigint;
ALTER TABLE operational.farms ADD CONSTRAINT farms_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.plots ADD COLUMN unit_id bigint;
ALTER TABLE operational.plots ADD CONSTRAINT plots_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.samples ADD COLUMN unit_id bigint;
ALTER TABLE operational.samples ADD CONSTRAINT samples_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.measurements ADD COLUMN unit_id bigint;
ALTER TABLE operational.measurements ADD CONSTRAINT measurements_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.equipment ADD COLUMN front_id bigint;
ALTER TABLE operational.equipment ADD CONSTRAINT equipment_org_front_fk
  FOREIGN KEY (organization_id, front_id) REFERENCES operational.fronts(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.quality_analyses ADD COLUMN unit_id bigint;
ALTER TABLE operational.quality_analyses ADD CONSTRAINT quality_analyses_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.validation_errors ADD COLUMN unit_id bigint;
ALTER TABLE operational.validation_errors ADD CONSTRAINT validation_errors_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.actions ADD COLUMN unit_id bigint;
ALTER TABLE operational.actions ADD CONSTRAINT actions_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE operational.closure_versions ADD COLUMN unit_id bigint;
ALTER TABLE operational.closure_versions ADD CONSTRAINT closure_versions_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE raw.import_batches ADD COLUMN unit_id bigint;
ALTER TABLE raw.import_batches ADD COLUMN front_id bigint;
ALTER TABLE raw.import_batches ADD CONSTRAINT import_batches_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE raw.import_batches ADD CONSTRAINT import_batches_org_front_fk
  FOREIGN KEY (organization_id, front_id) REFERENCES operational.fronts(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE raw.raw_import_rows ADD COLUMN unit_id bigint;
ALTER TABLE raw.raw_import_rows ADD COLUMN front_id bigint;
ALTER TABLE raw.raw_import_rows ADD CONSTRAINT raw_import_rows_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE raw.raw_import_rows ADD CONSTRAINT raw_import_rows_org_front_fk
  FOREIGN KEY (organization_id, front_id) REFERENCES operational.fronts(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE analytics.dim_harvest ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_harvest ADD CONSTRAINT dim_harvest_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.dim_supplier ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_supplier ADD CONSTRAINT dim_supplier_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.dim_farm ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_farm ADD CONSTRAINT dim_farm_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.dim_plot ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_plot ADD CONSTRAINT dim_plot_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.dim_front ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_front ADD CONSTRAINT dim_front_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.dim_equipment ADD COLUMN unit_id bigint;
ALTER TABLE analytics.dim_equipment ADD CONSTRAINT dim_equipment_org_unit_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.fact_samples_analyses ADD COLUMN unit_dim_id bigint;
ALTER TABLE analytics.fact_samples_analyses ADD CONSTRAINT fact_samples_unit_dim_fk
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES analytics.dim_unit(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE analytics.fact_imports_quality ADD COLUMN unit_dim_id bigint;
ALTER TABLE analytics.fact_imports_quality ADD CONSTRAINT fact_imports_unit_dim_fk
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES analytics.dim_unit(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE operational.technical_rules
  ADD COLUMN homologation_status text NOT NULL DEFAULT 'draft'
    CHECK (homologation_status IN ('draft', 'homologated', 'rejected')),
  ADD COLUMN homologated_by text,
  ADD COLUMN homologated_at timestamptz,
  ADD CONSTRAINT technical_rules_homologation_consistency
    CHECK ((homologation_status = 'homologated') = (homologated_at IS NOT NULL AND homologated_by IS NOT NULL)),
  ADD CONSTRAINT technical_rules_homologated_by_fk
    FOREIGN KEY (organization_id, homologated_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT;

CREATE FUNCTION operational.enforce_technical_rule_versioning() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.homologation_status <> 'draft' THEN
    RAISE EXCEPTION 'homologated or rejected rules are immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.homologation_status IS DISTINCT FROM OLD.homologation_status
    AND (NEW.homologation_status <> 'homologated'
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.rule_expression IS DISTINCT FROM OLD.rule_expression
      OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.indicator_id IS DISTINCT FROM OLD.indicator_id
      OR NEW.active IS DISTINCT FROM OLD.active) THEN
    RAISE EXCEPTION 'rule homologation must not change its versioned definition' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER technical_rules_are_versioned
  BEFORE UPDATE ON operational.technical_rules
  FOR EACH ROW EXECUTE FUNCTION operational.enforce_technical_rule_versioning();

CREATE TABLE operational.release_approvals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  measurement_id bigint,
  quality_analysis_id bigint,
  unit_id bigint NOT NULL,
  approved_by text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  justification text NOT NULL CHECK (length(trim(justification)) >= 10),
  CHECK (num_nonnulls(measurement_id, quality_analysis_id) = 1),
  UNIQUE (organization_id, measurement_id),
  UNIQUE (organization_id, quality_analysis_id),
  FOREIGN KEY (organization_id, measurement_id) REFERENCES operational.measurements(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, quality_analysis_id) REFERENCES operational.quality_analyses(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, approved_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.app_unit_allowed(requested_unit_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('app.allowed_units', true) = '*'
    OR (
      requested_unit_id IS NOT NULL
      AND requested_unit_id::text = ANY(string_to_array(NULLIF(current_setting('app.allowed_units', true), ''), ','))
    ),
    false
  )
$$;
CREATE OR REPLACE FUNCTION public.app_permission_allowed(requested_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT requested_permission = ANY(string_to_array(NULLIF(current_setting('app.permission_codes', true), ''), ','))
$$;
CREATE OR REPLACE FUNCTION public.app_department_allowed(requested_module text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE NULLIF(current_setting('app.department', true), '')
    WHEN 'ti' THEN true
    WHEN 'qualidade' THEN requested_module = ANY(ARRAY['quality', 'measurements', 'rules', 'imports', 'analytics', 'reports', 'periods', 'catalogs'])
    WHEN 'laboratorio' THEN requested_module = ANY(ARRAY['quality', 'measurements', 'imports', 'analytics', 'reports', 'catalogs'])
    WHEN 'agricola' THEN requested_module = ANY(ARRAY['units', 'harvests', 'equipment', 'imports', 'analytics', 'reports', 'occurrences', 'periods', 'catalogs'])
    WHEN 'industrial' THEN requested_module = ANY(ARRAY['units', 'equipment', 'measurements', 'quality', 'imports', 'analytics', 'reports', 'occurrences', 'periods', 'catalogs'])
    ELSE false
  END
$$;
CREATE OR REPLACE FUNCTION public.app_rbac_allowed(requested_module text, requested_action text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.app_permission_allowed(requested_module || ':' || requested_action)
    AND public.app_department_allowed(requested_module)
$$;
CREATE OR REPLACE FUNCTION public.app_front_allowed(requested_front_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('app.allowed_fronts', true) = '*'
    OR (
      requested_front_id IS NOT NULL
      AND requested_front_id::text = ANY(string_to_array(NULLIF(current_setting('app.allowed_fronts', true), ''), ','))
    ),
    false
  )
$$;
CREATE OR REPLACE FUNCTION public.app_unit_dimension_allowed(requested_dim_id bigint, requested_org_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN requested_dim_id IS NULL THEN public.app_unit_allowed(NULL)
    ELSE EXISTS (
      SELECT 1 FROM analytics.dim_unit du
      WHERE du.organization_id = requested_org_id
        AND du.id = requested_dim_id
        AND public.app_unit_allowed(du.unit_id)
    )
  END
$$;

ALTER TABLE operational.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.role_permissions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.user_roles NO FORCE ROW LEVEL SECURITY;

INSERT INTO operational.roles (organization_id, name)
SELECT o.id, role_name
FROM operational.organizations o
CROSS JOIN (VALUES ('organization_admin'), ('strategic'), ('tactical'), ('operational'), ('intern')) AS roles(role_name)
ON CONFLICT (organization_id, name) DO NOTHING;
WITH modules(name) AS (VALUES
  ('units'), ('harvests'), ('equipment'), ('measurements'), ('quality'), ('rules'),
  ('periods'), ('imports'), ('analytics'), ('users'), ('reports'), ('occurrences'), ('catalogs')
), actions(name) AS (VALUES
  ('can_read'), ('can_write'), ('can_approve_release'), ('can_homologate_rules'), ('can_export')
)
INSERT INTO operational.permissions (organization_id, code, module, action, description)
SELECT o.id, m.name || ':' || a.name, m.name, a.name, m.name || ' / ' || a.name
FROM operational.organizations o
CROSS JOIN modules m
CROSS JOIN actions a
ON CONFLICT (organization_id, module, action) DO NOTHING;

WITH grants(role_name, module, action) AS (
  SELECT r.name, m.name, a.name
  FROM (VALUES ('organization_admin'), ('strategic')) AS r(name)
  CROSS JOIN (VALUES
    ('units'), ('harvests'), ('equipment'), ('measurements'), ('quality'), ('rules'),
    ('periods'), ('imports'), ('analytics'), ('users'), ('reports'), ('occurrences'), ('catalogs')
  ) AS m(name)
  CROSS JOIN (VALUES
    ('can_read'), ('can_write'), ('can_approve_release'), ('can_homologate_rules'), ('can_export')
  ) AS a(name)
  UNION ALL
  SELECT 'tactical', m.name, a.name
  FROM (VALUES
    ('units'), ('harvests'), ('equipment'), ('measurements'), ('quality'), ('rules'),
    ('periods'), ('imports'), ('analytics'), ('users'), ('reports'), ('occurrences'), ('catalogs')
  ) AS m(name)
  CROSS JOIN (VALUES
    ('can_read'), ('can_write'), ('can_approve_release'), ('can_homologate_rules'), ('can_export')
  ) AS a(name)
  WHERE NOT (m.name = 'users' AND a.name = 'can_write')
  UNION ALL
  SELECT role_name, module, 'can_read'
  FROM (VALUES
    ('operational','units'), ('operational','harvests'), ('operational','equipment'),
    ('operational','measurements'), ('operational','quality'), ('operational','imports'),
    ('operational','analytics'), ('operational','reports'), ('operational','occurrences'),
    ('operational','catalogs'),
    ('intern','units'), ('intern','harvests'), ('intern','equipment'),
    ('intern','measurements'), ('intern','quality'), ('intern','imports'),
    ('intern','analytics'), ('intern','reports'), ('intern','occurrences'), ('intern','catalogs')
  ) AS read_grants(role_name, module)
  UNION ALL
  SELECT 'operational', module, 'can_write'
  FROM (VALUES
    ('units'), ('harvests'), ('equipment'), ('measurements'), ('quality'),
    ('imports'), ('occurrences'), ('catalogs')
  ) AS write_grants(module)
)
INSERT INTO operational.role_permissions (organization_id, role_id, permission_id)
SELECT r.organization_id, r.id, p.id
FROM operational.roles r
JOIN grants ON grants.role_name = r.name
JOIN operational.permissions p
  ON p.organization_id = r.organization_id
 AND p.module = grants.module
 AND p.action = grants.action
ON CONFLICT DO NOTHING;

INSERT INTO operational.user_roles (organization_id, user_id, role_id)
SELECT u.organization_id, u.id, r.id
FROM operational.users u
JOIN operational.roles r
  ON r.organization_id = u.organization_id
 AND r.name = CASE WHEN u.role = 'owner' THEN 'organization_admin' ELSE 'operational' END
ON CONFLICT DO NOTHING;

ALTER TABLE operational.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.user_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON operational.user_unit_scope
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (user_id = NULLIF(current_setting('app.current_user_id', true), '')
      OR public.app_permission_allowed('users:can_write'))
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (user_id = NULLIF(current_setting('app.current_user_id', true), '')
      OR public.app_permission_allowed('users:can_write'))
  );
CREATE POLICY tenant_isolation ON operational.user_front_scope
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (user_id = NULLIF(current_setting('app.current_user_id', true), '')
      OR public.app_permission_allowed('users:can_write'))
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (user_id = NULLIF(current_setting('app.current_user_id', true), '')
      OR public.app_permission_allowed('users:can_write'))
  );
CREATE POLICY tenant_isolation ON operational.release_approvals
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_unit_allowed(unit_id))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_unit_allowed(unit_id));
ALTER TABLE operational.user_unit_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.user_unit_scope FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.user_front_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.user_front_scope FORCE ROW LEVEL SECURITY;
ALTER TABLE operational.release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.release_approvals FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  unit_table text[];
  schema_table text;
  unit_tables text[][] := ARRAY[
  ARRAY['operational.units', 'id'],
  ARRAY['operational.harvests', 'unit_id'],
  ARRAY['operational.farms', 'unit_id'],
  ARRAY['operational.plots', 'unit_id'],
  ARRAY['operational.fronts', 'unit_id'],
  ARRAY['operational.equipment', 'unit_id'],
  ARRAY['operational.loads', 'unit_id'],
  ARRAY['operational.samples', 'unit_id'],
  ARRAY['operational.measurements', 'unit_id'],
  ARRAY['operational.quality_analyses', 'unit_id'],
  ARRAY['operational.validation_errors', 'unit_id'],
  ARRAY['operational.actions', 'unit_id'],
  ARRAY['operational.occurrences', 'unit_id'],
  ARRAY['operational.closure_versions', 'unit_id'],
  ARRAY['raw.import_batches', 'unit_id'],
  ARRAY['raw.raw_import_rows', 'unit_id'],
  ARRAY['analytics.dim_unit', 'unit_id'],
  ARRAY['analytics.dim_harvest', 'unit_id'],
  ARRAY['analytics.dim_supplier', 'unit_id'],
  ARRAY['analytics.dim_farm', 'unit_id'],
  ARRAY['analytics.dim_plot', 'unit_id'],
  ARRAY['analytics.dim_front', 'unit_id'],
  ARRAY['analytics.dim_equipment', 'unit_id']
];
BEGIN
  FOREACH unit_table SLICE 1 IN ARRAY unit_tables
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %s', unit_table[1]);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(%I)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(%I))',
      unit_table[1], unit_table[2], unit_table[2]);
  END LOOP;
  FOREACH schema_table IN ARRAY ARRAY[
    'operational.departments', 'operational.roles', 'operational.permissions', 'operational.suppliers',
    'operational.role_permissions', 'operational.user_roles', 'operational.unit_of_measure',
    'operational.analytical_methods', 'operational.indicator_definitions',
    'operational.technical_rules', 'operational.versioned_targets', 'operational.sources',
    'operational.audit_events', 'operational.dashboard_reports',
    'analytics.dim_date', 'analytics.dim_org', 'analytics.dim_indicator', 'analytics.dim_source',
    'analytics.dim_method', 'analytics.dim_validation_status',
    'analytics.fact_loads_weighing', 'analytics.fact_samples_analyses',
    'analytics.fact_industrial_measurements', 'analytics.fact_events_stoppages',
    'analytics.fact_imports_quality', 'analytics.fact_occurrences'
  ]
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %s', schema_table);
    IF schema_table IN ('analytics.fact_loads_weighing', 'analytics.fact_samples_analyses',
      'analytics.fact_industrial_measurements', 'analytics.fact_events_stoppages',
      'analytics.fact_imports_quality', 'analytics.fact_occurrences') THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id))', schema_table);
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''')) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), ''''))', schema_table);
    END IF;
  END LOOP;
  EXECUTE 'DROP POLICY tenant_isolation ON analytics.dim_unit';
  EXECUTE 'CREATE POLICY tenant_isolation ON analytics.dim_unit USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id))';
  EXECUTE 'DROP POLICY tenant_isolation ON operational.fronts';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.fronts USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND public.app_front_allowed(id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND public.app_front_allowed(id))';
  EXECUTE 'DROP POLICY tenant_isolation ON analytics.dim_front';
  EXECUTE 'CREATE POLICY tenant_isolation ON analytics.dim_front USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND public.app_front_allowed(front_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND public.app_front_allowed(front_id))';
  EXECUTE 'DROP POLICY tenant_isolation ON operational.equipment';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.equipment USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON operational.loads';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.loads USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON raw.import_batches';
  EXECUTE 'CREATE POLICY tenant_isolation ON raw.import_batches USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON raw.raw_import_rows';
  EXECUTE 'CREATE POLICY tenant_isolation ON raw.raw_import_rows USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (front_id IS NULL OR public.app_front_allowed(front_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON operational.measurements';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.measurements USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (equipment_id IS NULL OR EXISTS (SELECT 1 FROM operational.equipment e WHERE e.organization_id = measurements.organization_id AND e.id = measurements.equipment_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND (equipment_id IS NULL OR EXISTS (SELECT 1 FROM operational.equipment e WHERE e.organization_id = measurements.organization_id AND e.id = measurements.equipment_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON analytics.fact_loads_weighing';
  EXECUTE 'CREATE POLICY tenant_isolation ON analytics.fact_loads_weighing USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id) AND (front_dim_id IS NULL OR EXISTS (SELECT 1 FROM analytics.dim_front f WHERE f.organization_id = fact_loads_weighing.organization_id AND f.id = fact_loads_weighing.front_dim_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id) AND (front_dim_id IS NULL OR EXISTS (SELECT 1 FROM analytics.dim_front f WHERE f.organization_id = fact_loads_weighing.organization_id AND f.id = fact_loads_weighing.front_dim_id)))';
  EXECUTE 'DROP POLICY tenant_isolation ON analytics.dim_equipment';
  EXECUTE 'CREATE POLICY tenant_isolation ON analytics.dim_equipment USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND EXISTS (SELECT 1 FROM operational.equipment e WHERE e.organization_id = dim_equipment.organization_id AND e.id = dim_equipment.equipment_id AND (e.front_id IS NULL OR public.app_front_allowed(e.front_id)))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id) AND EXISTS (SELECT 1 FROM operational.equipment e WHERE e.organization_id = dim_equipment.organization_id AND e.id = dim_equipment.equipment_id AND (e.front_id IS NULL OR public.app_front_allowed(e.front_id))))';
  FOREACH schema_table IN ARRAY ARRAY[
    'analytics.fact_industrial_measurements', 'analytics.fact_events_stoppages',
    'analytics.fact_occurrences'
  ]
  LOOP
    EXECUTE format('DROP POLICY tenant_isolation ON %s', schema_table);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id) AND (equipment_dim_id IS NULL OR EXISTS (SELECT 1 FROM analytics.dim_equipment e WHERE e.organization_id = %s.organization_id AND e.id = %s.equipment_dim_id))) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_dimension_allowed(unit_dim_id, organization_id) AND (equipment_dim_id IS NULL OR EXISTS (SELECT 1 FROM analytics.dim_equipment e WHERE e.organization_id = %s.organization_id AND e.id = %s.equipment_dim_id))',
      schema_table, schema_table, schema_table, schema_table, schema_table);
  END LOOP;
END $$;

DO $$
DECLARE
  policy_table text[];
  scoped_tables text[][] := ARRAY[
    ARRAY['operational.units', 'units'],
    ARRAY['operational.harvests', 'harvests'],
    ARRAY['operational.suppliers', 'harvests'],
    ARRAY['operational.farms', 'harvests'],
    ARRAY['operational.plots', 'harvests'],
    ARRAY['operational.fronts', 'units'],
    ARRAY['operational.equipment', 'equipment'],
    ARRAY['operational.unit_of_measure', 'catalogs'],
    ARRAY['operational.analytical_methods', 'catalogs'],
    ARRAY['operational.indicator_definitions', 'catalogs'],
    ARRAY['operational.technical_rules', 'rules'],
    ARRAY['operational.versioned_targets', 'rules'],
    ARRAY['operational.sources', 'imports'],
    ARRAY['operational.loads', 'harvests'],
    ARRAY['operational.samples', 'quality'],
    ARRAY['operational.quality_analyses', 'quality'],
    ARRAY['operational.measurements', 'measurements'],
    ARRAY['operational.validation_errors', 'quality'],
    ARRAY['operational.occurrences', 'occurrences'],
    ARRAY['operational.actions', 'occurrences'],
    ARRAY['operational.dashboard_reports', 'reports'],
    ARRAY['raw.import_batches', 'imports'],
    ARRAY['raw.raw_import_rows', 'imports'],
    ARRAY['analytics.dim_date', 'analytics'],
    ARRAY['analytics.dim_org', 'analytics'],
    ARRAY['analytics.dim_unit', 'analytics'],
    ARRAY['analytics.dim_harvest', 'analytics'],
    ARRAY['analytics.dim_indicator', 'analytics'],
    ARRAY['analytics.dim_source', 'analytics'],
    ARRAY['analytics.dim_supplier', 'analytics'],
    ARRAY['analytics.dim_farm', 'analytics'],
    ARRAY['analytics.dim_plot', 'analytics'],
    ARRAY['analytics.dim_front', 'analytics'],
    ARRAY['analytics.dim_equipment', 'analytics'],
    ARRAY['analytics.dim_method', 'analytics'],
    ARRAY['analytics.dim_validation_status', 'analytics'],
    ARRAY['analytics.fact_loads_weighing', 'analytics'],
    ARRAY['analytics.fact_samples_analyses', 'analytics'],
    ARRAY['analytics.fact_industrial_measurements', 'analytics'],
    ARRAY['analytics.fact_events_stoppages', 'analytics'],
    ARRAY['analytics.fact_imports_quality', 'analytics'],
    ARRAY['analytics.fact_occurrences', 'analytics']
  ];
BEGIN
  FOREACH policy_table SLICE 1 IN ARRAY scoped_tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS rbac_select ON %s', policy_table[1]);
    EXECUTE format('DROP POLICY IF EXISTS rbac_insert ON %s', policy_table[1]);
    EXECUTE format('DROP POLICY IF EXISTS rbac_update ON %s', policy_table[1]);
    EXECUTE format('DROP POLICY IF EXISTS rbac_delete ON %s', policy_table[1]);
    EXECUTE format('CREATE POLICY rbac_select ON %s AS RESTRICTIVE FOR SELECT USING (public.app_rbac_allowed(%L, ''can_read''))',
      policy_table[1], policy_table[2]);
    EXECUTE format('CREATE POLICY rbac_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (public.app_rbac_allowed(%L, ''can_write''))',
      policy_table[1], policy_table[2]);
    EXECUTE format('CREATE POLICY rbac_update ON %s AS RESTRICTIVE FOR UPDATE USING (public.app_rbac_allowed(%L, ''can_write'')) WITH CHECK (public.app_rbac_allowed(%L, ''can_write''))',
      policy_table[1], policy_table[2], policy_table[2]);
    EXECUTE format('CREATE POLICY rbac_delete ON %s AS RESTRICTIVE FOR DELETE USING (public.app_rbac_allowed(%L, ''can_write''))',
      policy_table[1], policy_table[2]);
  END LOOP;

  EXECUTE 'CREATE POLICY homologate_rules_only ON operational.technical_rules AS RESTRICTIVE FOR UPDATE USING (public.app_rbac_allowed(''rules'', ''can_homologate_rules'')) WITH CHECK (public.app_rbac_allowed(''rules'', ''can_homologate_rules''))';
  EXECUTE 'CREATE POLICY technical_rules_no_delete ON operational.technical_rules AS RESTRICTIVE FOR DELETE USING (false)';
  EXECUTE 'CREATE POLICY versioned_targets_homologation ON operational.versioned_targets AS RESTRICTIVE FOR INSERT WITH CHECK (public.app_rbac_allowed(''rules'', ''can_homologate_rules'') AND current_setting(''app.access_level'', true) IN (''tactical'', ''strategic''))';
  EXECUTE 'CREATE POLICY versioned_targets_read_only ON operational.versioned_targets AS RESTRICTIVE FOR UPDATE USING (false)';
  EXECUTE 'CREATE POLICY versioned_targets_no_delete ON operational.versioned_targets AS RESTRICTIVE FOR DELETE USING (false)';

  EXECUTE 'DROP POLICY tenant_isolation ON operational.release_approvals';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.release_approvals USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id))';
  EXECUTE 'CREATE POLICY release_approval_read ON operational.release_approvals AS RESTRICTIVE FOR SELECT USING (public.app_rbac_allowed(''quality'', ''can_read''))';
  EXECUTE 'CREATE POLICY release_approval_insert ON operational.release_approvals AS RESTRICTIVE FOR INSERT WITH CHECK (public.app_rbac_allowed(''quality'', ''can_approve_release'') AND current_setting(''app.access_level'', true) IN (''tactical'', ''strategic''))';
  EXECUTE 'CREATE POLICY release_approval_no_update ON operational.release_approvals AS RESTRICTIVE FOR UPDATE USING (false)';
  EXECUTE 'CREATE POLICY release_approval_no_delete ON operational.release_approvals AS RESTRICTIVE FOR DELETE USING (false)';

  EXECUTE 'DROP POLICY tenant_isolation ON operational.closure_versions';
  EXECUTE 'CREATE POLICY tenant_isolation ON operational.closure_versions USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id))';
  EXECUTE 'CREATE POLICY closure_read ON operational.closure_versions AS RESTRICTIVE FOR SELECT USING (public.app_rbac_allowed(''periods'', ''can_read''))';
  EXECUTE 'CREATE POLICY closure_insert ON operational.closure_versions AS RESTRICTIVE FOR INSERT WITH CHECK (public.app_rbac_allowed(''periods'', ''can_write'') AND current_setting(''app.access_level'', true) IN (''tactical'', ''strategic''))';
  EXECUTE 'CREATE POLICY closure_no_update ON operational.closure_versions AS RESTRICTIVE FOR UPDATE USING (false)';
  EXECUTE 'CREATE POLICY closure_no_delete ON operational.closure_versions AS RESTRICTIVE FOR DELETE USING (false)';

  EXECUTE 'CREATE POLICY audit_events_read ON operational.audit_events AS RESTRICTIVE FOR SELECT USING (public.app_rbac_allowed(''users'', ''can_read''))';
  EXECUTE 'CREATE POLICY audit_events_insert ON operational.audit_events AS RESTRICTIVE FOR INSERT WITH CHECK (
    public.app_rbac_allowed(''users'', ''can_write'')
    OR public.app_rbac_allowed(''quality'', ''can_approve_release'')
    OR public.app_rbac_allowed(''rules'', ''can_homologate_rules'')
    OR public.app_rbac_allowed(''periods'', ''can_write''))';
  EXECUTE 'CREATE POLICY audit_events_no_update ON operational.audit_events AS RESTRICTIVE FOR UPDATE USING (false)';
  EXECUTE 'CREATE POLICY audit_events_no_delete ON operational.audit_events AS RESTRICTIVE FOR DELETE USING (false)';
END $$;
