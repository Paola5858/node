SET LOCAL search_path = public, pg_catalog;

CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 120),
  email text NOT NULL UNIQUE CHECK (length(email) <= 254),
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  photo_data text,
  photo_object_key text,
  favorites_json jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(favorites_json) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  csrf_hash text NOT NULL,
  expires_at bigint NOT NULL CHECK (expires_at > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);

CREATE TABLE departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE TABLE roles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE TABLE permissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (length(trim(code)) > 0),
  description text NOT NULL DEFAULT '',
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, code)
);
CREATE TABLE role_permissions (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  role_id bigint NOT NULL,
  permission_id bigint NOT NULL,
  PRIMARY KEY (organization_id, role_id, permission_id),
  FOREIGN KEY (organization_id, role_id) REFERENCES roles(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, permission_id) REFERENCES permissions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE user_roles (
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  user_id text NOT NULL,
  role_id bigint NOT NULL,
  PRIMARY KEY (organization_id, user_id, role_id),
  FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, role_id) REFERENCES roles(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE units (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  state char(2) CHECK (state IS NULL OR state ~ '^[A-Z]{2}$'),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE TABLE harvests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  photo_object_key text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);
CREATE TABLE suppliers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  tax_identifier text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, tax_identifier)
);
CREATE TABLE farms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id bigint,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  external_code text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE plots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  farm_id bigint NOT NULL,
  code text NOT NULL CHECK (length(trim(code)) > 0),
  area_hectares numeric(14,4) CHECK (area_hectares IS NULL OR area_hectares > 0),
  variety text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, farm_id, code),
  FOREIGN KEY (organization_id, farm_id) REFERENCES farms(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fronts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id bigint,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE equipment (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id bigint,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  equipment_type text,
  serial_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE unit_of_measure (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  symbol text NOT NULL CHECK (length(trim(symbol)) > 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, symbol)
);

CREATE TABLE analytical_methods (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  version text NOT NULL CHECK (length(trim(version)) > 0),
  description text NOT NULL DEFAULT '',
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name, version)
);
CREATE TABLE indicator_definitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  method_id bigint,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  unit_of_measure_id bigint,
  description text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name),
  FOREIGN KEY (organization_id, method_id) REFERENCES analytical_methods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_of_measure_id) REFERENCES unit_of_measure(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE technical_rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  indicator_id bigint,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  rule_expression text NOT NULL CHECK (length(trim(rule_expression)) > 0),
  version text NOT NULL CHECK (length(trim(version)) > 0),
  active boolean NOT NULL DEFAULT true,
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE versioned_targets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  indicator_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  target_value numeric NOT NULL,
  valid_from date NOT NULL,
  valid_to date,
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  UNIQUE (organization_id, indicator_id, version),
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  source_type text NOT NULL CHECK (source_type IN ('manual', 'file', 'staging', 'api')),
  authorized_read_only boolean NOT NULL DEFAULT true CHECK (authorized_read_only),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);

CREATE TABLE loads (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  harvest_id bigint,
  supplier_id bigint,
  farm_id bigint,
  plot_id bigint,
  front_id bigint,
  unit_id bigint,
  source_id bigint,
  external_reference text,
  gross_weight numeric(16,3) CHECK (gross_weight IS NULL OR gross_weight >= 0),
  tare_weight numeric(16,3) CHECK (tare_weight IS NULL OR tare_weight >= 0),
  net_weight numeric(16,3) GENERATED ALWAYS AS (gross_weight - tare_weight) STORED,
  weighed_at timestamptz,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  CHECK (gross_weight IS NULL OR tare_weight IS NULL OR gross_weight >= tare_weight),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, harvest_id) REFERENCES harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, farm_id) REFERENCES farms(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, plot_id) REFERENCES plots(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, front_id) REFERENCES fronts(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE samples (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  load_id bigint,
  harvest_id bigint,
  source_id bigint,
  sample_code text NOT NULL CHECK (length(trim(sample_code)) > 0),
  sampled_at timestamptz,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, sample_code),
  FOREIGN KEY (organization_id, load_id) REFERENCES loads(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_id) REFERENCES harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE quality_analyses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  sample_id bigint NOT NULL,
  indicator_id bigint NOT NULL,
  method_id bigint,
  source_id bigint,
  valor_original text NOT NULL,
  unidade_original text NOT NULL,
  valor_normalizado numeric,
  unidade_normalizada text,
  regra_aplicada text,
  versao_processamento text NOT NULL CHECK (length(trim(versao_processamento)) > 0),
  responsavel_ou_processo text NOT NULL CHECK (length(trim(responsavel_ou_processo)) > 0),
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'quarantined')),
  CHECK (received_at >= measured_at),
  CHECK (processed_at >= received_at),
  CHECK (released_at >= processed_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, sample_id) REFERENCES samples(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, method_id) REFERENCES analytical_methods(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE measurements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  harvest_id bigint,
  equipment_id bigint,
  indicator_id bigint NOT NULL,
  source_id bigint,
  valor_original text NOT NULL,
  unidade_original text NOT NULL,
  valor_normalizado numeric,
  unidade_normalizada text,
  regra_aplicada text,
  versao_processamento text NOT NULL CHECK (length(trim(versao_processamento)) > 0),
  responsavel_ou_processo text NOT NULL CHECK (length(trim(responsavel_ou_processo)) > 0),
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'quarantined')),
  CHECK (received_at >= measured_at),
  CHECK (processed_at >= received_at),
  CHECK (released_at >= processed_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, harvest_id) REFERENCES harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, equipment_id) REFERENCES equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE FUNCTION prevent_measurement_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'measurements and analyses are immutable; create a new record' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER measurements_are_immutable
  BEFORE UPDATE OR DELETE ON measurements
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_mutation();
CREATE TRIGGER quality_analyses_are_immutable
  BEFORE UPDATE OR DELETE ON quality_analyses
  FOR EACH ROW EXECUTE FUNCTION prevent_measurement_mutation();

CREATE TABLE import_batches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_id bigint NOT NULL,
  uploaded_by text,
  object_key text NOT NULL CHECK (length(trim(object_key)) > 0),
  original_filename text NOT NULL,
  content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'quarantined')),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, uploaded_by) REFERENCES users(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE raw_import_rows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  import_batch_id bigint NOT NULL,
  source_row_number bigint NOT NULL CHECK (source_row_number > 0),
  raw_payload jsonb NOT NULL CHECK (jsonb_typeof(raw_payload) IN ('object', 'array')),
  row_sha256 char(64) NOT NULL CHECK (row_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, import_batch_id, source_row_number),
  FOREIGN KEY (organization_id, import_batch_id) REFERENCES import_batches(organization_id, id) ON DELETE RESTRICT
);
CREATE FUNCTION prevent_raw_import_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'raw import rows are immutable' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER raw_import_rows_are_immutable
  BEFORE UPDATE OR DELETE ON raw_import_rows
  FOR EACH ROW EXECUTE FUNCTION prevent_raw_import_row_mutation();
CREATE TABLE validation_errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  import_batch_id bigint,
  measurement_id bigint,
  quality_analysis_id bigint,
  code text NOT NULL CHECK (length(trim(code)) > 0),
  message text NOT NULL CHECK (length(trim(message)) > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(import_batch_id, measurement_id, quality_analysis_id) <= 1),
  FOREIGN KEY (organization_id, import_batch_id) REFERENCES import_batches(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, measurement_id) REFERENCES measurements(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, quality_analysis_id) REFERENCES quality_analyses(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE occurrences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id bigint,
  equipment_id bigint,
  indicator_id bigint,
  source_id bigint,
  title text NOT NULL CHECK (length(trim(title)) > 0),
  description text NOT NULL DEFAULT '',
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  occurred_at timestamptz NOT NULL,
  closed_at timestamptz,
  CHECK (closed_at IS NULL OR closed_at >= occurred_at),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, equipment_id) REFERENCES equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint,
  assigned_to text,
  description text NOT NULL CHECK (length(trim(description)) > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  CHECK (completed_at IS NULL OR (due_at IS NULL OR completed_at >= due_at)),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, assigned_to) REFERENCES users(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_user_id text,
  event_type text NOT NULL CHECK (length(trim(event_type)) > 0),
  entity_type text NOT NULL CHECK (length(trim(entity_type)) > 0),
  entity_id text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, actor_user_id) REFERENCES users(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE closure_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  harvest_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (status IN ('draft', 'released', 'superseded')),
  released_by text,
  released_at timestamptz,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  CHECK ((status = 'released') = (released_at IS NOT NULL)),
  UNIQUE (organization_id, harvest_id, version),
  FOREIGN KEY (organization_id, harvest_id) REFERENCES harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, released_by) REFERENCES users(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE dashboard_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 2000),
  url text NOT NULL CHECK (url ~ '^https://app\.powerbi\.com/'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES users(organization_id, id) ON DELETE RESTRICT
);

CREATE TABLE dim_date (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  calendar_date date NOT NULL,
  year smallint NOT NULL CHECK (year BETWEEN 1900 AND 2200),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  day smallint NOT NULL CHECK (day BETWEEN 1 AND 31),
  harvest_year text,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, calendar_date)
);
CREATE TABLE dim_org (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  org_code text NOT NULL,
  org_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, org_code)
);
CREATE TABLE dim_unit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  unit_id bigint NOT NULL,
  unit_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, unit_id),
  FOREIGN KEY (organization_id, unit_id) REFERENCES units(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_harvest (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  harvest_id bigint NOT NULL,
  harvest_name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, harvest_id),
  FOREIGN KEY (organization_id, harvest_id) REFERENCES harvests(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_indicator (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  indicator_id bigint NOT NULL,
  indicator_name text NOT NULL,
  unit_symbol text,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, indicator_id),
  FOREIGN KEY (organization_id, indicator_id) REFERENCES indicator_definitions(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_source (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  source_id bigint NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, source_id),
  FOREIGN KEY (organization_id, source_id) REFERENCES sources(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_supplier (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  supplier_id bigint NOT NULL,
  supplier_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, supplier_id),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_farm (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  farm_id bigint NOT NULL,
  farm_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, farm_id),
  FOREIGN KEY (organization_id, farm_id) REFERENCES farms(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_plot (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  plot_id bigint NOT NULL,
  plot_code text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, plot_id),
  FOREIGN KEY (organization_id, plot_id) REFERENCES plots(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_front (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  front_id bigint NOT NULL,
  front_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, front_id),
  FOREIGN KEY (organization_id, front_id) REFERENCES fronts(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_equipment (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  equipment_id bigint NOT NULL,
  equipment_name text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, equipment_id),
  FOREIGN KEY (organization_id, equipment_id) REFERENCES equipment(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_method (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  method_id bigint NOT NULL,
  method_name text NOT NULL,
  method_version text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, method_id),
  FOREIGN KEY (organization_id, method_id) REFERENCES analytical_methods(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE dim_validation_status (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  status_code text NOT NULL CHECK (status_code IN ('pending', 'valid', 'invalid', 'quarantined')),
  status_label text NOT NULL,
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, status_code)
);

CREATE TABLE fact_loads_weighing (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  load_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  unit_dim_id bigint,
  harvest_dim_id bigint,
  supplier_dim_id bigint,
  farm_dim_id bigint,
  plot_dim_id bigint,
  front_dim_id bigint,
  source_dim_id bigint,
  gross_weight numeric(16,3) NOT NULL CHECK (gross_weight >= 0),
  tare_weight numeric(16,3) NOT NULL CHECK (tare_weight >= 0),
  net_weight numeric(16,3) NOT NULL CHECK (net_weight >= 0 AND net_weight = gross_weight - tare_weight),
  weighed_at timestamptz NOT NULL,
  UNIQUE (organization_id, load_id),
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES dim_unit(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_dim_id) REFERENCES dim_harvest(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, supplier_dim_id) REFERENCES dim_supplier(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, farm_dim_id) REFERENCES dim_farm(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, plot_dim_id) REFERENCES dim_plot(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, front_dim_id) REFERENCES dim_front(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, load_id) REFERENCES loads(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fact_samples_analyses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  quality_analysis_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  harvest_dim_id bigint,
  indicator_dim_id bigint NOT NULL,
  source_dim_id bigint,
  method_dim_id bigint,
  validation_status_dim_id bigint NOT NULL,
  value_normalized numeric,
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  UNIQUE (organization_id, quality_analysis_id),
  FOREIGN KEY (organization_id, quality_analysis_id) REFERENCES quality_analyses(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_dim_id) REFERENCES dim_harvest(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_dim_id) REFERENCES dim_indicator(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, method_dim_id) REFERENCES dim_method(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, validation_status_dim_id) REFERENCES dim_validation_status(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fact_industrial_measurements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  measurement_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  unit_dim_id bigint,
  harvest_dim_id bigint,
  indicator_dim_id bigint NOT NULL,
  source_dim_id bigint,
  equipment_dim_id bigint,
  validation_status_dim_id bigint NOT NULL,
  value_normalized numeric,
  measured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL,
  released_at timestamptz NOT NULL,
  UNIQUE (organization_id, measurement_id),
  FOREIGN KEY (organization_id, measurement_id) REFERENCES measurements(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES dim_unit(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_dim_id) REFERENCES dim_harvest(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_dim_id) REFERENCES dim_indicator(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, equipment_dim_id) REFERENCES dim_equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, validation_status_dim_id) REFERENCES dim_validation_status(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fact_events_stoppages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  unit_dim_id bigint,
  equipment_dim_id bigint,
  source_dim_id bigint,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds bigint CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  UNIQUE (organization_id, occurrence_id),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES dim_unit(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, equipment_dim_id) REFERENCES dim_equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fact_imports_quality (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  import_batch_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  source_dim_id bigint NOT NULL,
  received_count bigint NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  accepted_count bigint NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count bigint NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  quality_rate numeric(7,4) CHECK (quality_rate IS NULL OR quality_rate BETWEEN 0 AND 100),
  UNIQUE (organization_id, import_batch_id),
  FOREIGN KEY (organization_id, import_batch_id) REFERENCES import_batches(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT
);
CREATE TABLE fact_occurrences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  occurrence_id bigint NOT NULL,
  date_id bigint NOT NULL,
  org_dim_id bigint NOT NULL,
  unit_dim_id bigint,
  equipment_dim_id bigint,
  indicator_dim_id bigint,
  source_dim_id bigint,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  UNIQUE (organization_id, occurrence_id),
  FOREIGN KEY (organization_id, occurrence_id) REFERENCES occurrences(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, date_id) REFERENCES dim_date(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, org_dim_id) REFERENCES dim_org(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, unit_dim_id) REFERENCES dim_unit(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, equipment_dim_id) REFERENCES dim_equipment(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, indicator_dim_id) REFERENCES dim_indicator(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, source_dim_id) REFERENCES dim_source(organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX measurements_org_measured_at ON measurements (organization_id, measured_at);
CREATE INDEX analyses_org_measured_at ON quality_analyses (organization_id, measured_at);
CREATE INDEX loads_org_weighed_at ON loads (organization_id, weighed_at);
CREATE INDEX occurrences_org_occurred_at ON occurrences (organization_id, occurred_at);
CREATE INDEX imports_org_received_at ON import_batches (organization_id, received_at);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'departments', 'roles', 'permissions', 'role_permissions', 'user_roles',
    'units', 'harvests', 'suppliers', 'farms', 'plots', 'fronts', 'equipment',
    'unit_of_measure', 'analytical_methods', 'indicator_definitions', 'technical_rules',
    'versioned_targets', 'sources', 'loads', 'samples', 'quality_analyses', 'measurements',
    'import_batches', 'raw_import_rows', 'validation_errors', 'occurrences', 'actions', 'audit_events',
    'closure_versions', 'dashboard_reports', 'dim_date', 'dim_org', 'dim_unit',
    'dim_harvest', 'dim_indicator', 'dim_source', 'dim_supplier', 'dim_farm', 'dim_plot',
    'dim_front', 'dim_equipment', 'dim_method', 'dim_validation_status',
    'fact_loads_weighing', 'fact_samples_analyses', 'fact_industrial_measurements',
    'fact_events_stoppages', 'fact_imports_quality', 'fact_occurrences'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = nullif(current_setting(''app.organization_id'', true), '''')) WITH CHECK (organization_id = nullif(current_setting(''app.organization_id'', true), ''''))',
      table_name
    );
  END LOOP;
END $$;

CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS operational;
CREATE SCHEMA IF NOT EXISTS analytics;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['import_batches', 'raw_import_rows']
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA raw', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'organizations', 'users', 'sessions', 'departments', 'roles', 'permissions',
    'role_permissions', 'user_roles', 'units', 'harvests', 'suppliers', 'farms',
    'plots', 'fronts', 'equipment', 'unit_of_measure', 'analytical_methods',
    'indicator_definitions', 'technical_rules', 'versioned_targets', 'sources',
    'loads', 'samples', 'quality_analyses', 'measurements', 'validation_errors',
    'occurrences', 'actions', 'audit_events', 'closure_versions', 'dashboard_reports'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA operational', table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY[
    'dim_date', 'dim_org', 'dim_unit', 'dim_harvest', 'dim_indicator', 'dim_source',
    'dim_supplier', 'dim_farm', 'dim_plot', 'dim_front', 'dim_equipment', 'dim_method',
    'dim_validation_status', 'fact_loads_weighing', 'fact_samples_analyses',
    'fact_industrial_measurements', 'fact_events_stoppages', 'fact_imports_quality',
    'fact_occurrences'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I SET SCHEMA analytics', table_name);
  END LOOP;
END $$;
