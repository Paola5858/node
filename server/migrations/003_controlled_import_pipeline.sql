SET LOCAL search_path = public, pg_catalog;

ALTER TABLE raw.import_batches
  DROP CONSTRAINT import_batches_status_check,
  ADD CONSTRAINT import_batches_status_check
    CHECK (status IN ('received', 'uploaded', 'previewed', 'queued', 'processing', 'processed', 'failed', 'quarantined')),
  ADD COLUMN harvest_id bigint,
  ADD COLUMN version integer CHECK (version IS NULL OR version > 0),
  ADD COLUMN reprocess_of bigint,
  ADD COLUMN selected_sheet text,
  ADD COLUMN mapping_json jsonb CHECK (mapping_json IS NULL OR jsonb_typeof(mapping_json) = 'object'),
  ADD COLUMN mapping_template_id bigint,
  ADD COLUMN previewed_at timestamptz,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN processing_started_at timestamptz,
  ADD COLUMN processed_at timestamptz,
  ADD COLUMN confirmed_by text,
  ADD COLUMN failure_message text,
  ADD COLUMN quality_metrics jsonb CHECK (quality_metrics IS NULL OR jsonb_typeof(quality_metrics) = 'object'),
  ADD CONSTRAINT import_batches_org_harvest_fk
    FOREIGN KEY (organization_id, harvest_id) REFERENCES operational.harvests(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT import_batches_reprocess_fk
    FOREIGN KEY (organization_id, reprocess_of) REFERENCES raw.import_batches(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT import_batches_confirmed_by_fk
    FOREIGN KEY (organization_id, confirmed_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT import_batches_reprocess_not_self CHECK (reprocess_of IS NULL OR reprocess_of <> id);

CREATE UNIQUE INDEX import_batches_hash_version_unique
  ON raw.import_batches (organization_id, COALESCE(unit_id, 0), content_sha256, version)
  WHERE version IS NOT NULL;
CREATE INDEX import_batches_org_status ON raw.import_batches (organization_id, status, received_at DESC);

ALTER TABLE raw.raw_import_rows
  ADD COLUMN row_queue text NOT NULL DEFAULT 'Pendentes'
    CHECK (row_queue IN ('Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes')),
  ADD COLUMN validation_issues jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(validation_issues) = 'array'),
  ADD COLUMN normalized_payload jsonb
    CHECK (normalized_payload IS NULL OR jsonb_typeof(normalized_payload) = 'object');

ALTER TABLE operational.validation_errors
  ADD COLUMN category text
    CHECK (category IS NULL OR category IN (
      'structural', 'typing', 'unit_scale', 'technical_range', 'temporal',
      'duplication', 'referential_integrity', 'field_coherence', 'traceability',
      'contingency_sync', 'source_reconciliation'
    )),
  ADD COLUMN row_queue text
    CHECK (row_queue IS NULL OR row_queue IN ('Aceitos', 'Rejeitados', 'Suspeitos', 'Pendentes')),
  ADD COLUMN source_row_number bigint CHECK (source_row_number IS NULL OR source_row_number > 0);

ALTER TABLE operational.technical_rules
  ADD COLUMN minimum_value numeric,
  ADD COLUMN maximum_value numeric,
  ADD CONSTRAINT technical_rules_valid_range
    CHECK (minimum_value IS NULL OR maximum_value IS NULL OR minimum_value <= maximum_value);

ALTER TABLE operational.measurements
  ADD COLUMN import_batch_id bigint,
  ADD COLUMN source_row_number bigint CHECK (source_row_number IS NULL OR source_row_number > 0),
  ADD CONSTRAINT measurements_import_batch_fk
    FOREIGN KEY (organization_id, import_batch_id) REFERENCES raw.import_batches(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT measurements_import_row_unique
    UNIQUE (organization_id, import_batch_id, source_row_number);

ALTER TABLE analytics.fact_imports_quality
  ADD COLUMN suspect_count bigint NOT NULL DEFAULT 0 CHECK (suspect_count >= 0),
  ADD COLUMN pending_count bigint NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  ADD COLUMN quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(quality_metrics) = 'object');

CREATE TABLE raw.import_mapping_templates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  source_id bigint NOT NULL,
  created_by text NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  sheet_name text,
  mapping_json jsonb NOT NULL CHECK (jsonb_typeof(mapping_json) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, source_id, name),
  FOREIGN KEY (organization_id, source_id) REFERENCES operational.sources(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, created_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
ALTER TABLE raw.import_batches
  ADD CONSTRAINT import_batches_template_fk
    FOREIGN KEY (organization_id, mapping_template_id)
    REFERENCES raw.import_mapping_templates(organization_id, id) ON DELETE RESTRICT;
ALTER TABLE raw.import_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw.import_mapping_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY import_mapping_templates_read ON raw.import_mapping_templates
  FOR SELECT USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_rbac_allowed('imports', 'can_read')
  );
CREATE POLICY import_mapping_templates_write ON raw.import_mapping_templates
  FOR ALL USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_rbac_allowed('imports', 'can_write')
  ) WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_rbac_allowed('imports', 'can_write')
  );

CREATE TABLE raw.import_jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL,
  import_batch_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'failed', 'completed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, import_batch_id),
  FOREIGN KEY (organization_id, import_batch_id)
    REFERENCES raw.import_batches(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX import_jobs_claim ON raw.import_jobs (available_at, id) WHERE status = 'queued';
CREATE INDEX import_jobs_expired_lease ON raw.import_jobs (lease_until, id) WHERE status = 'processing';

DROP POLICY audit_events_insert ON operational.audit_events;
CREATE POLICY audit_events_insert ON operational.audit_events AS RESTRICTIVE FOR INSERT WITH CHECK (
  public.app_rbac_allowed('users', 'can_write')
  OR public.app_rbac_allowed('quality', 'can_approve_release')
  OR public.app_rbac_allowed('rules', 'can_homologate_rules')
  OR public.app_rbac_allowed('rules', 'can_write')
  OR public.app_rbac_allowed('periods', 'can_write')
  OR public.app_rbac_allowed('imports', 'can_write')
);

DROP POLICY homologate_rules_only ON operational.technical_rules;
CREATE POLICY homologate_rules_only ON operational.technical_rules AS RESTRICTIVE FOR UPDATE
  USING (
    public.app_rbac_allowed('rules', 'can_homologate_rules')
    AND current_setting('app.access_level', true) IN ('tactical', 'strategic')
  )
  WITH CHECK (
    public.app_rbac_allowed('rules', 'can_homologate_rules')
    AND current_setting('app.access_level', true) IN ('tactical', 'strategic')
  );
CREATE POLICY technical_rules_draft_insert ON operational.technical_rules AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    public.app_rbac_allowed('rules', 'can_write')
    AND current_setting('app.access_level', true) IN ('tactical', 'strategic')
  );

CREATE OR REPLACE FUNCTION public.app_department_allowed(requested_module text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE NULLIF(current_setting('app.department', true), '')
    WHEN 'ti' THEN true
    WHEN 'qualidade' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'quality', 'measurements', 'rules',
      'imports', 'analytics', 'reports', 'periods', 'catalogs'
    ])
    WHEN 'laboratorio' THEN requested_module = ANY(ARRAY[
      'units', 'harvests', 'equipment', 'quality', 'measurements',
      'imports', 'analytics', 'reports', 'catalogs'
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
