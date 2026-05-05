-- Restructure artworks to match the dealer's factsheet format.
-- V1 has no real artwork data yet — safe to drop the old free-text columns.

alter table artworks
  add column signature_details text,
  add column height_in numeric(8,2),
  add column width_in numeric(8,2),
  add column depth_in numeric(8,2),
  add column catalogue_raisonne text,
  add column literature text,
  add column provenance_lines text[] not null default '{}';

alter table artworks drop column provenance;
alter table artworks drop column dimensions;
