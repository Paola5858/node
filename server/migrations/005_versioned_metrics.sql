SET LOCAL search_path = public, pg_catalog;

ALTER TABLE operational.loads
  ADD COLUMN weight_unit text
    CHECK (weight_unit IS NULL OR length(trim(weight_unit)) BETWEEN 1 AND 20);

CREATE TABLE operational.metric_definitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (category IN (
    'volume', 'quality', 'productivity', 'recoverable_sugar', 'execution',
    'logistics', 'losses', 'data_quality', 'industrial', 'economic'
  )),
  unit text NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 40),
  granularity text NOT NULL CHECK (length(trim(granularity)) BETWEEN 1 AND 80),
  aggregation_rule text NOT NULL CHECK (length(trim(aggregation_rule)) BETWEEN 1 AND 120),
  required_fields jsonb NOT NULL CHECK (jsonb_typeof(required_fields) = 'array'),
  source_aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(source_aliases) = 'array'),
  minimum_value numeric,
  maximum_value numeric,
  tolerance numeric CHECK (tolerance IS NULL OR tolerance >= 0),
  target_value numeric,
  desirable_direction text NOT NULL CHECK (desirable_direction IN (
    'higher_is_better', 'lower_is_better', 'context_dependent'
  )),
  technical_source text NOT NULL CHECK (length(trim(technical_source)) BETWEEN 1 AND 2000),
  formula text NOT NULL CHECK (length(trim(formula)) BETWEEN 1 AND 2000),
  critical_delay_minutes integer NOT NULL DEFAULT 1440 CHECK (critical_delay_minutes > 0),
  valid_from date NOT NULL,
  valid_to date,
  rule_version text NOT NULL CHECK (length(trim(rule_version)) BETWEEN 1 AND 40),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'homologated', 'rejected')),
  homologated_by text,
  homologated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (maximum_value IS NULL OR minimum_value IS NULL OR minimum_value <= maximum_value),
  CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CHECK ((status = 'homologated') = (homologated_by IS NOT NULL AND homologated_at IS NOT NULL)),
  UNIQUE (organization_id, code, rule_version),
  FOREIGN KEY (organization_id, homologated_by)
    REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX metric_definitions_lookup
  ON operational.metric_definitions (organization_id, code, valid_from DESC);

CREATE FUNCTION operational.prevent_homologated_metric_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'homologated metric definitions are immutable; create a new version'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER metric_definitions_are_versioned
  BEFORE UPDATE OR DELETE ON operational.metric_definitions
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_homologated_metric_mutation();

CREATE TABLE operational.harvest_production_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id text NOT NULL REFERENCES operational.organizations(id) ON DELETE RESTRICT,
  unit_id bigint NOT NULL,
  harvest_id bigint NOT NULL,
  plot_id bigint NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  harvested_tonnes numeric(16,3) NOT NULL CHECK (harvested_tonnes >= 0),
  harvested_hectares numeric(14,4) NOT NULL CHECK (harvested_hectares > 0),
  harvested_at date NOT NULL,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, harvest_id, plot_id, version),
  FOREIGN KEY (organization_id, unit_id) REFERENCES operational.units(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, harvest_id) REFERENCES operational.harvests(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, plot_id) REFERENCES operational.plots(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, recorded_by) REFERENCES operational.users(organization_id, id) ON DELETE RESTRICT
);
CREATE INDEX harvest_production_period
  ON operational.harvest_production_records (organization_id, harvested_at, harvest_id, plot_id, version DESC);
CREATE FUNCTION operational.prevent_harvest_production_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'harvest production records are immutable; create a new version'
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER harvest_production_records_are_immutable
  BEFORE UPDATE OR DELETE ON operational.harvest_production_records
  FOR EACH ROW EXECUTE FUNCTION operational.prevent_harvest_production_mutation();

INSERT INTO operational.metric_definitions (
  organization_id, code, name, category, unit, granularity, aggregation_rule,
  required_fields, source_aliases, desirable_direction, technical_source, formula,
  valid_from, rule_version, status, homologated_by, homologated_at
)
SELECT org.id, metric.code, metric.name, metric.category, metric.unit, metric.granularity,
  metric.aggregation_rule, metric.required_fields::jsonb, metric.source_aliases::jsonb,
  metric.desirable_direction, metric.technical_source, metric.formula, current_date,
  '1.0.0', 'homologated', owner.id, now()
FROM operational.organizations org
JOIN LATERAL (
  SELECT id FROM operational.users
  WHERE organization_id = org.id
  ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at
  LIMIT 1
) owner ON true
CROSS JOIN (VALUES
  ('RECEIVED_TONNES','Toneladas recebidas','volume','t','load','sum','["load.net_weight","load.weight_unit"]','[]','higher_is_better','Pesagens de cargas vinculadas a unidade e safra.','Soma de toneladas líquidas de cargas recebidas.'),
  ('DELIVERED_TONNES','Toneladas entregues','volume','t','load','sum','["load.net_weight","load.weight_unit"]','[]','higher_is_better','Pesagens de cargas com destino confirmado.','Soma de toneladas líquidas entregues.'),
  ('LOAD_COUNT','Cargas recebidas','volume','cargas','load','count','["load.external_reference","load.weighed_at"]','[]','higher_is_better','Registros operacionais de pesagem.','Contagem de cargas com referência única.'),
  ('ATR_WEIGHTED','ATR ponderado','quality','kg ATR/t cana','sample-load','weighted_average','["quality_analysis.atr","sample.load_id","load.net_weight","load.weight_unit"]','["atr","atr ponderado","atr (kg/t)","açúcar total recuperável"]','higher_is_better','ATR Consecana por análise de amostra associada à carga pesável.','SUM(ATR_i * Toneladas_i) / SUM(Toneladas_i)'),
  ('BRIX_WEIGHTED','Brix ponderado','quality','°Bx','sample-load','weighted_average','["quality_analysis.brix","sample.load_id","load.net_weight"]','["brix","°bx","brix caldo"]','context_dependent','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('POL_WEIGHTED','Pol ponderado','quality','%','sample-load','weighted_average','["quality_analysis.pol","sample.load_id","load.net_weight"]','["pol","pol caldo"]','context_dependent','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('PURITY_WEIGHTED','Pureza ponderada','quality','%','sample-load','weighted_average','["quality_analysis.purity","sample.load_id","load.net_weight"]','["pureza","purity"]','context_dependent','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('FIBER_WEIGHTED','Fibra ponderada','quality','%','sample-load','weighted_average','["quality_analysis.fiber","sample.load_id","load.net_weight"]','["fibra","fiber"]','context_dependent','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('AR_WEIGHTED','Açúcares redutores ponderados','quality','%','sample-load','weighted_average','["quality_analysis.ar","sample.load_id","load.net_weight"]','["ar","açúcares redutores","acucares redutores"]','lower_is_better','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('VEGETAL_IMPURITY_WEIGHTED','Impureza vegetal ponderada','quality','%','sample-load','weighted_average','["quality_analysis.vegetal_impurity","sample.load_id","load.net_weight"]','["impureza vegetal","vegetal impurity"]','lower_is_better','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('MINERAL_IMPURITY_WEIGHTED','Impureza mineral ponderada','quality','%','sample-load','weighted_average','["quality_analysis.mineral_impurity","sample.load_id","load.net_weight"]','["impureza mineral","mineral impurity"]','lower_is_better','Análises laboratoriais vinculadas a amostras e cargas.','Média ponderada pelo peso líquido das cargas associadas às amostras.'),
  ('TCH','Toneladas de cana por hectare','productivity','t/ha','plot-harvest','ratio','["harvested_tonnes.plot_id","harvested_tonnes.harvest_id","harvested_area.hectares"]','[]','higher_is_better','Produção colhida e área colhida conciliadas por talhão e safra.','Toneladas_Colhidas / Hectares_Colhidos, para talhão e safra compatíveis.'),
  ('HARVESTED_AREA_HA','Área colhida','productivity','ha','plot-harvest','sum','["harvested_area.plot_id","harvested_area.harvest_id","harvested_area.hectares"]','[]','higher_is_better','Apontamentos de área colhida conciliados por talhão e safra.','Soma da área efetivamente colhida por talhão e safra.'),
  ('ATR_TONNES','Toneladas de ATR','recoverable_sugar','t ATR','sample-load','sum_weighted_value_div_1000','["quality_analysis.atr","sample.load_id","load.net_weight","load.weight_unit"]','["atr","atr ponderado","atr (kg/t)","açúcar total recuperável"]','higher_is_better','ATR Consecana por análise de amostra associada à carga pesável.','SUM(ATR_i * Toneladas_i) / 1000'),
  ('PLAN_EXECUTION_PCT','Execução do plano','execution','%','unit-day','actual_div_plan','["actual.value","plan.value"]','[]','context_dependent','Realizado e plano versionado para a mesma unidade e período.','Realizado / Plano * 100; valores ausentes não são zero.'),
  ('LOGISTICS_CYCLE_MINUTES','Tempo de ciclo logístico','logistics','min','load','duration','["load.arrived_at","load.departed_at"]','[]','lower_is_better','Eventos de ciclo logístico com referência de carga conciliada.','Duração entre eventos de chegada e saída da mesma carga.'),
  ('PROCESS_LOSSES_TONNES','Perdas de processo','losses','t','unit-period','sum','["loss.value","loss.unit"]','[]','lower_is_better','Registros de perdas industriais validados.','Soma de perdas medidas e classificadas no período.'),
  ('DATA_SAMPLE_COVERAGE_PCT','Cobertura de amostras','data_quality','%','sample-period','coverage','["sample.expected_count","sample.valid_count"]','[]','higher_is_better','Plano de amostragem e análises válidas.','Amostras válidas / amostras esperadas * 100.'),
  ('DATA_LOAD_COVERAGE_PCT','Cobertura de toneladas','data_quality','%','load-period','coverage','["load.expected_tonnes","load.sampled_tonnes"]','[]','higher_is_better','Pesagens e análises vinculadas por carga.','Toneladas com amostra válida / toneladas elegíveis * 100.'),
  ('INDUSTRIAL_EXTRACTION_PCT','Extração industrial','industrial','%','unit-period','weighted_average','["industrial.extraction","industrial.throughput"]','[]','context_dependent','Medições industriais conciliadas com moagem e paradas.','Cálculo ponderado pela moagem efetiva, excluindo paradas.'),
  ('INDUSTRIAL_STEAM_TONNES_PER_TONNE','Consumo específico de vapor','industrial','t/t cana','unit-period','ratio','["industrial.steam_tonnes","industrial.cane_tonnes"]','[]','lower_is_better','Medições industriais de vapor e moagem conciliadas.','Vapor total / cana moída; paradas operacionais são isoladas.'),
  ('ECONOMIC_COST_PER_TONNE','Custo por tonelada','economic','moeda/t','unit-period','ratio','["economic.cost","production.tonnes"]','[]','lower_is_better','Custos conciliados e produção do mesmo escopo.','Custo elegível / produção compatível no mesmo período.')
) AS metric(
  code, name, category, unit, granularity, aggregation_rule,
  required_fields, source_aliases, desirable_direction, technical_source, formula
);

ALTER TABLE operational.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.metric_definitions FORCE ROW LEVEL SECURITY;
CREATE POLICY metric_definitions_tenant ON operational.metric_definitions
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), ''))
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), ''));
CREATE POLICY metric_definitions_read ON operational.metric_definitions AS RESTRICTIVE
  FOR SELECT USING (public.app_rbac_allowed('analytics', 'can_read'));
CREATE POLICY metric_definitions_insert ON operational.metric_definitions AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    public.app_rbac_allowed('analytics', 'can_write')
    AND current_setting('app.access_level', true) IN ('tactical', 'strategic')
  );
CREATE POLICY metric_definitions_update ON operational.metric_definitions AS RESTRICTIVE
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY metric_definitions_delete ON operational.metric_definitions AS RESTRICTIVE
  FOR DELETE USING (false);

ALTER TABLE operational.harvest_production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational.harvest_production_records FORCE ROW LEVEL SECURITY;
CREATE POLICY harvest_production_tenant ON operational.harvest_production_records
  USING (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_unit_allowed(unit_id)
  )
  WITH CHECK (
    organization_id = NULLIF(current_setting('app.current_org_id', true), '')
    AND public.app_unit_allowed(unit_id)
  );
CREATE POLICY harvest_production_read ON operational.harvest_production_records AS RESTRICTIVE
  FOR SELECT USING (public.app_rbac_allowed('analytics', 'can_read'));
CREATE POLICY harvest_production_insert ON operational.harvest_production_records AS RESTRICTIVE
  FOR INSERT WITH CHECK (public.app_rbac_allowed('harvests', 'can_write'));
CREATE POLICY harvest_production_update ON operational.harvest_production_records AS RESTRICTIVE
  FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY harvest_production_delete ON operational.harvest_production_records AS RESTRICTIVE
  FOR DELETE USING (false);
