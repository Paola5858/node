SET LOCAL search_path = public, pg_catalog;

CREATE TABLE operational.load_weighings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  load_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  weighing_type text NOT NULL CHECK (weighing_type IN ('entry', 'exit')),
  vehicle_plate text NOT NULL CHECK (length(trim(vehicle_plate)) BETWEEN 2 AND 20),
  gross_weight numeric(16,3) NOT NULL CHECK (gross_weight >= 0),
  tare_weight numeric(16,3) NOT NULL CHECK (tare_weight >= 0),
  net_weight numeric(16,3) GENERATED ALWAYS AS (gross_weight - tare_weight) STORED,
  weighed_at timestamptz NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (gross_weight >= tare_weight),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, load_id) REFERENCES operational.loads(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX load_weighings_trace ON operational.load_weighings (organization_id, load_id, weighed_at);

CREATE TABLE operational.equipment_calibrations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  equipment_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  certificate_reference text NOT NULL CHECK (length(trim(certificate_reference)) BETWEEN 1 AND 160),
  calibrated_at timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('valid', 'expired', 'rejected')),
  method_id bigint,
  performed_by text NOT NULL,
  notes text NOT NULL DEFAULT '',
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until >= calibrated_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, equipment_id) REFERENCES operational.equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, method_id) REFERENCES operational.analytical_methods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, performed_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX equipment_calibration_current
  ON operational.equipment_calibrations (organization_id, equipment_id, valid_until DESC);

ALTER TABLE operational.quality_analyses
  ADD COLUMN measurement_mode text NOT NULL DEFAULT 'unknown'
    CHECK (measurement_mode IN ('automatic', 'manual', 'unknown')),
  ADD COLUMN equipment_id bigint,
  ADD COLUMN calibration_id bigint,
  ADD COLUMN replicate_of_id bigint,
  ADD CONSTRAINT quality_analyses_equipment_fk
    FOREIGN KEY (organization_id, equipment_id) REFERENCES operational.equipment(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT quality_analyses_calibration_fk
    FOREIGN KEY (organization_id, calibration_id) REFERENCES operational.equipment_calibrations(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT quality_analyses_replicate_fk
    FOREIGN KEY (organization_id, replicate_of_id) REFERENCES operational.quality_analyses(organization_id, id) ON DELETE RESTRICT;

ALTER TABLE operational.measurements
  ADD COLUMN measurement_mode text NOT NULL DEFAULT 'unknown'
    CHECK (measurement_mode IN ('automatic', 'manual', 'unknown')),
  ADD COLUMN calibration_id bigint,
  ADD COLUMN replicate_of_id bigint,
  ADD COLUMN corrects_measurement_id bigint,
  ADD COLUMN correction_version integer NOT NULL DEFAULT 0 CHECK (correction_version >= 0),
  ADD COLUMN correction_justification text,
  ADD CONSTRAINT measurements_calibration_fk
    FOREIGN KEY (organization_id, calibration_id) REFERENCES operational.equipment_calibrations(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT measurements_replicate_fk
    FOREIGN KEY (organization_id, replicate_of_id) REFERENCES operational.measurements(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT measurements_correction_fk
    FOREIGN KEY (organization_id, corrects_measurement_id) REFERENCES operational.measurements(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT measurements_correction_metadata
    CHECK (
      (corrects_measurement_id IS NULL AND correction_version = 0 AND correction_justification IS NULL)
      OR (corrects_measurement_id IS NOT NULL AND correction_version > 0
        AND length(trim(correction_justification)) >= 10)
    );
CREATE UNIQUE INDEX measurements_correction_version_unique
  ON operational.measurements (organization_id, corrects_measurement_id, correction_version)
  WHERE corrects_measurement_id IS NOT NULL;

ALTER TABLE operational.occurrences
  ADD COLUMN responsible_user_id text,
  ADD COLUMN due_at timestamptz,
  ADD COLUMN period_start date,
  ADD COLUMN period_end date,
  ADD COLUMN affected_scope jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(affected_scope) = 'object'),
  ADD CONSTRAINT occurrences_period_range
    CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  ADD CONSTRAINT occurrences_responsible_fk
    FOREIGN KEY (organization_id, responsible_user_id) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT;

CREATE TABLE operational.record_states (
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  entity_type text NOT NULL CHECK (entity_type IN (
    'load', 'sample', 'quality_analysis', 'measurement', 'occurrence'
  )),
  entity_id bigint NOT NULL CHECK (entity_id > 0),
  unit_id bigint,
  operational_condition text NOT NULL DEFAULT 'unknown'
    CHECK (operational_condition IN ('normal', 'attention', 'stopped', 'unknown')),
  data_condition text NOT NULL DEFAULT 'pendente'
    CHECK (data_condition IN ('validado', 'atenção', 'inválido', 'pendente')),
  attention_priority text NOT NULL DEFAULT 'none'
    CHECK (attention_priority IN ('none', 'low', 'medium', 'high', 'critical')),
  investigation_status text NOT NULL DEFAULT 'not_started'
    CHECK (investigation_status IN ('not_started', 'open', 'in_analysis', 'action_defined', 'executed', 'verified')),
  release_status text NOT NULL DEFAULT 'pending'
    CHECK (release_status IN ('normal', 'authorized_exception', 'blocked', 'pending')),
  origin_status text NOT NULL DEFAULT 'não_confirmada'
    CHECK (origin_status IN ('informada', 'validada', 'não_confirmada')),
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, entity_type, entity_id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, updated_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE operational.occurrence_evidence (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('kpi', 'load', 'sample')),
  metric_code text,
  load_id bigint,
  sample_id bigint,
  period_start date,
  period_end date,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(metric_code, load_id, sample_id) = 1),
  CHECK (period_start IS NULL OR period_end IS NULL OR period_end >= period_start),
  CHECK (
    (evidence_type = 'kpi' AND metric_code IS NOT NULL AND load_id IS NULL AND sample_id IS NULL)
    OR (evidence_type = 'load' AND load_id IS NOT NULL AND metric_code IS NULL AND sample_id IS NULL)
    OR (evidence_type = 'sample' AND sample_id IS NOT NULL AND metric_code IS NULL AND load_id IS NULL)
  ),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES operational.occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, load_id) REFERENCES operational.loads(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, sample_id) REFERENCES operational.samples(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX occurrence_evidence_lookup
  ON operational.occurrence_evidence (organization_id, occurrence_id, recorded_at);

CREATE TABLE operational.occurrence_workflow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  from_status text CHECK (from_status IS NULL OR from_status IN ('open', 'in_analysis', 'action_defined', 'executed', 'verified')),
  to_status text NOT NULL CHECK (to_status IN ('open', 'in_analysis', 'action_defined', 'executed', 'verified')),
  actor_user_id text NOT NULL,
  action_id bigint,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES operational.occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, action_id) REFERENCES operational.actions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE operational.occurrence_verifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint NOT NULL,
  unit_id bigint NOT NULL,
  result text NOT NULL CHECK (length(trim(result)) BETWEEN 10 AND 4000),
  reincidence boolean NOT NULL,
  verified_by text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES operational.occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, verified_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE operational.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  unit_id bigint,
  actor_user_id text NOT NULL,
  request_id text,
  event_type text NOT NULL CHECK (length(trim(event_type)) > 0),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id text NOT NULL,
  justification text,
  before_data jsonb CHECK (before_data IS NULL OR jsonb_typeof(before_data) = 'object'),
  after_data jsonb CHECK (after_data IS NULL OR jsonb_typeof(after_data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX audit_logs_entity ON operational.audit_logs (organization_id, entity_type, entity_id, created_at);

CREATE TABLE operational.metric_recalculation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  unit_id bigint,
  source_measurement_id bigint NOT NULL,
  indicator_id bigint NOT NULL,
  harvest_id bigint,
  period_start date NOT NULL,
  period_end date NOT NULL,
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_measurement_id) REFERENCES operational.measurements(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_id) REFERENCES operational.indicator_definitions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_id) REFERENCES operational.harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, requested_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);

CREATE FUNCTION operational.prevent_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; create a new event or version', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER load_weighings_are_immutable
  BEFORE UPDATE OR DELETE ON operational.load_weighings
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER equipment_calibrations_are_immutable
  BEFORE UPDATE OR DELETE ON operational.equipment_calibrations
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER occurrence_evidence_are_immutable
  BEFORE UPDATE OR DELETE ON operational.occurrence_evidence
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER occurrence_workflow_events_are_immutable
  BEFORE UPDATE OR DELETE ON operational.occurrence_workflow_events
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER occurrence_verifications_are_immutable
  BEFORE UPDATE OR DELETE ON operational.occurrence_verifications
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER audit_logs_are_immutable
  BEFORE UPDATE OR DELETE ON operational.audit_logs
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();
CREATE TRIGGER metric_recalculation_events_are_immutable
  BEFORE UPDATE OR DELETE ON operational.metric_recalculation_events
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_append_only_mutation();

CREATE OR REPLACE FUNCTION public.app_department_allowed(requested_module text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE NULLIF(current_setting('app.department', true), '')
    WHEN 'ti' THEN true
    WHEN 'qualidade' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'quality', 'measurements', 'rules',
      'imports', 'analytics', 'reports', 'periods', 'catalogs', 'occurrences'
    ])
    WHEN 'laboratorio' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'quality', 'measurements',
      'imports', 'analytics', 'reports', 'catalogs', 'occurrences'
    ])
    WHEN 'agricola' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'imports', 'analytics', 'reports',
      'occurrences', 'periods', 'catalogs'
    ])
    WHEN 'industrial' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'measurements', 'quality', 'imports',
      'analytics', 'reports', 'occurrences', 'periods', 'catalogs'
    ])
    ELSE false
  END
$$;

DO $$
DECLARE
  table_name text[];
  table_module text;
  scoped_tables text[][] := ARRAY[
    ARRAY['operational.load_weighings', 'harvests'],
    ARRAY['operational.equipment_calibrations', 'quality'],
    ARRAY['operational.occurrence_evidence', 'occurrences'],
    ARRAY['operational.occurrence_workflow_events', 'occurrences'],
    ARRAY['operational.occurrence_verifications', 'occurrences'],
    ARRAY['operational.metric_recalculation_events', 'measurements']
  ];
BEGIN
  FOREACH table_name SLICE 1 IN ARRAY scoped_tables
  LOOP
    table_module := table_name[2];
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', table_name[1]);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', table_name[1]);
    EXECUTE format(
      'CREATE POLICY tenant_scope ON %s USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id)) WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), '''') AND public.app_unit_allowed(unit_id))',
      table_name[1]
    );
    EXECUTE format('CREATE POLICY module_read ON %s AS RESTRICTIVE FOR SELECT USING (public.app_rbac_allowed(%L, ''can_read''))',
      table_name[1], table_module);
    EXECUTE format('CREATE POLICY module_insert ON %s AS RESTRICTIVE FOR INSERT WITH CHECK (public.app_rbac_allowed(%L, ''can_write''))',
      table_name[1], table_module);
    EXECUTE format('CREATE POLICY no_update ON %s AS RESTRICTIVE FOR UPDATE USING (false) WITH CHECK (false)', table_name[1]);
    EXECUTE format('CREATE POLICY no_delete ON %s AS RESTRICTIVE FOR DELETE USING (false)', table_name[1]);
  END LOOP;
END $$;

ALTER TABLE operational.record_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.record_states FORCE ROW LEVEL SECURITY;
CREATE POLICY record_states_tenant ON operational.record_states
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (unit_id IS NULL OR public.app_unit_allowed(unit_id))
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (unit_id IS NULL OR public.app_unit_allowed(unit_id))
  );
CREATE POLICY record_states_read ON operational.record_states AS RESTRICTIVE
  FOR SELECT USING (public.app_rbac_allowed('analytics', 'can_read'));
CREATE POLICY record_states_insert ON operational.record_states AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    public.app_rbac_allowed('harvests', 'can_write')
    OR public.app_rbac_allowed('quality', 'can_write')
    OR public.app_rbac_allowed('measurements', 'can_write')
    OR public.app_rbac_allowed('occurrences', 'can_write')
  );
CREATE POLICY record_states_update ON operational.record_states AS RESTRICTIVE
  FOR UPDATE USING (
    public.app_rbac_allowed('harvests', 'can_write')
    OR public.app_rbac_allowed('quality', 'can_write')
    OR public.app_rbac_allowed('measurements', 'can_write')
    OR public.app_rbac_allowed('occurrences', 'can_write')
  )
  WITH CHECK (
    public.app_rbac_allowed('harvests', 'can_write')
    OR public.app_rbac_allowed('quality', 'can_write')
    OR public.app_rbac_allowed('measurements', 'can_write')
    OR public.app_rbac_allowed('occurrences', 'can_write')
  );
CREATE POLICY record_states_delete ON operational.record_states AS RESTRICTIVE
  FOR DELETE USING (false);

ALTER TABLE operational.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant ON operational.audit_logs
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (unit_id IS NULL OR public.app_unit_allowed(unit_id))
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND (unit_id IS NULL OR public.app_unit_allowed(unit_id))
  );
CREATE POLICY audit_logs_read ON operational.audit_logs AS RESTRICTIVE
  FOR SELECT USING (public.app_rbac_allowed('users', 'can_read'));
CREATE POLICY audit_logs_insert ON operational.audit_logs AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    public.app_rbac_allowed('users', 'can_write')
    OR public.app_rbac_allowed('harvests', 'can_write')
    OR public.app_rbac_allowed('quality', 'can_write')
    OR public.app_rbac_allowed('measurements', 'can_write')
    OR public.app_rbac_allowed('occurrences', 'can_write')
    OR public.app_rbac_allowed('analytics', 'can_write')
  );
CREATE POLICY audit_logs_update ON operational.audit_logs AS RESTRICTIVE
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY audit_logs_delete ON operational.audit_logs AS RESTRICTIVE
  FOR DELETE USING (false);
