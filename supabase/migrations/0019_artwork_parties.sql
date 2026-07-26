-- Artwork <-> party edges, now role-bearing.
--
-- 0016 shipped `artwork_ownerships`: one row = one TITLE edge (who holds/held a
-- work). The dealer also needs to record who else is attached to a work without
-- holding title — the advisor who placed it, the gallery handling it, the party
-- who consigned it, the conservator who has it on the bench.
--
-- Those edges have the identical shape: (artwork, party, open interval, source,
-- confidence, notes). So this is a `role` column, not a second table — a second
-- table would force the capture form to fan out to two destinations keyed on the
-- role, which is exactly the "average two patterns" outcome to avoid.
--
-- The table is RENAMED rather than kept as `artwork_ownerships`, deliberately:
-- once an advisor row can live in it, the old name is a lie, and worse, any read
-- site left un-patched would silently report that advisor as an owner. Renaming
-- makes every stale read fail loudly instead. `role = 'owner'` is now the ONLY
-- thing that means title — every owner projection must filter on it.
--
-- Untouched by design: provenance_lines[] (tearsheet display text, 0001),
-- current_party_address_id (physical location, 0009), and party_relationships
-- (party-to-party, 0007). This edge is artwork-to-party.

alter table artwork_ownerships rename to artwork_parties;

-- Postgres carries none of these along with the table rename; redo them by hand
-- so nothing left in the schema still says "ownerships".
alter table artwork_parties rename constraint artwork_ownerships_pkey to artwork_parties_pkey;
alter table artwork_parties rename constraint artwork_ownerships_check to artwork_parties_interval_check;
alter table artwork_parties rename constraint artwork_ownerships_source_check to artwork_parties_source_check;
alter table artwork_parties rename constraint artwork_ownerships_confidence_check to artwork_parties_confidence_check;
alter table artwork_parties rename constraint artwork_ownerships_artwork_id_fkey to artwork_parties_artwork_id_fkey;
alter table artwork_parties rename constraint artwork_ownerships_party_id_fkey to artwork_parties_party_id_fkey;

alter index artwork_ownerships_artwork_idx rename to artwork_parties_artwork_idx;
alter index artwork_ownerships_party_idx rename to artwork_parties_party_idx;

alter trigger artwork_ownerships_set_updated_at on artwork_parties
  rename to artwork_parties_set_updated_at;

alter policy "authenticated full access on artwork_ownerships" on artwork_parties
  rename to "authenticated full access on artwork_parties";

-- Default 'owner' backfills every 0016 row correctly (they were all title edges)
-- and makes the primary case the zero-config insert.
alter table artwork_parties
  add column role text not null default 'owner'
    check (role in (
      'owner','consignor','advisor','gallery','agent','custodian','conservator','lender','other'
    ));

-- The open-edge uniqueness rule is now per-role. Joint ownership stays legal (two
-- parties, both open 'owner' rows), a party can be both owner and advisor on the
-- same work, but the same (work, party, role) can't be open twice.
drop index artwork_ownerships_current_uniq;
create unique index artwork_parties_open_uniq
  on artwork_parties(artwork_id, party_id, role) where ended_on is null;
