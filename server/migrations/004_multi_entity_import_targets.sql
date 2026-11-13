SET LOCAL search_path = public, pg_catalog;

ALTER TABLE raw.import_batches
  ADD COLUMN entity_type text NOT NULL DEFAULT 'measurements'
    CHECK (entity_type IN ('measurements', 'loads', 'quality_analyses'));

DROP INDEX raw.import_batches_hash_version_unique;
CREATE UNIQUE INDEX import_batches_hash_version_unique
  ON raw.import_batches (organization_id, COALESCE(unit_id, 0), entity_type, content_sha256, version)
  WHERE version IS NOT NULL;

ALTER TABLE raw.import_mapping_templates
  ADD COLUMN entity_type text NOT NULL DEFAULT 'measurements'
    CHECK (entity_type IN ('measurements', 'loads', 'quality_analyses')),
  DROP CONSTRAINT import_mapping_templates_organization_id_source_id_name_key,
  ADD CONSTRAINT import_mapping_templates_entity_name_unique
    UNIQUE (organization_id, source_id, entity_type, name);

ALTER TABLE operational.loads
  ADD COLUMN import_batch_id bigint,
  ADD COLUMN source_row_number bigint CHECK (source_row_number IS NULL OR source_row_number > 0),
  ADD CONSTRAINT loads_import_batch_fk
    FOREIGN KEY (organization_id, import_batch_id) REFERENCES raw.import_batches(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT loads_import_row_unique
    UNIQUE (organization_id, import_batch_id, source_row_number);

CREATE UNIQUE INDEX loads_external_reference_unique
  ON operational.loads (organization_id, unit_id, external_reference)
  WHERE external_reference IS NOT NULL;

ALTER TABLE operational.quality_analyses
  ADD COLUMN import_batch_id bigint,
  ADD COLUMN source_row_number bigint CHECK (source_row_number IS NULL OR source_row_number > 0),
  ADD CONSTRAINT quality_analyses_import_batch_fk
    FOREIGN KEY (organization_id, import_batch_id) REFERENCES raw.import_batches(organization_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT quality_analyses_import_row_unique
    UNIQUE (organization_id, import_batch_id, source_row_number);
