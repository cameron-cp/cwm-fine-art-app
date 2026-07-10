-- Where an artwork physically sits. A "place" is a party_addresses row (a collector's
-- Storage/Freeport/Residence, or a storage vendor's address) — reusing the structured
-- address model from 0008 rather than a parallel locations table.
--
-- Location is deliberately orthogonal to OWNERSHIP and CUSTODY: this column says where
-- the work is, not who holds title. Ownership/provenance is not modeled here.
--
-- on delete set null: if the referenced address (or its party) is removed, the artwork
-- record survives with no location — matches the invoices.buyer_party_id precedent
-- (0007). The party_addresses write path is a stable-id upsert (see contacts/actions.ts)
-- so ordinary contact edits do NOT churn address ids and never null this column.

alter table artworks
  add column current_party_address_id uuid
    references party_addresses(id) on delete set null;

create index artworks_current_party_address_id_idx
  on artworks(current_party_address_id);
