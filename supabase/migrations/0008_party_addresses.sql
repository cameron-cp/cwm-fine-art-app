-- Structured, international, multi-address support for parties + entity type.
--
-- Two changes driven by real dealer feedback:
--   1. parties.entity_type — a party is NOT always an LLC. Individuals, trusts,
--      estates, foundations, galleries, and non-US corporate forms (Ltd, GmbH,
--      SA…) all buy and hold art. entity_type captures the legal structure;
--      the app validates the enum, the column stays plain text for headroom.
--   2. party_addresses — wealthy collectors keep works across residences,
--      offices, storage, and freeports, each with its own address. Replace the
--      single free-text parties.address with a child table (mirrors party_roles):
--      several labeled, country-aware addresses per party, one marked primary.
--
-- Invoices are unaffected: they already SNAPSHOT bill-to/ship-to as immutable
-- text (0007). The app flattens the chosen structured address into that text at
-- invoice-creation time — no invoice schema change.

alter table parties add column entity_type text;

create table party_addresses (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references parties(id) on delete cascade,
  label text,                        -- 'Residence' | 'Office' | 'Storage' | 'Freeport' | free text
  line1 text not null,
  line2 text,
  city text,
  region text,                       -- state / province / county / prefecture
  postal_code text,
  country_code text,                 -- ISO 3166-1 alpha-2 (e.g. 'US','GB','CH')
  is_primary boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index party_addresses_party_idx on party_addresses(party_id, position);

-- At most one primary address per party (partial unique index).
create unique index party_addresses_one_primary_idx
  on party_addresses(party_id) where is_primary;

create trigger party_addresses_set_updated_at before update on party_addresses
  for each row execute function set_updated_at();

alter table party_addresses enable row level security;
create policy "authenticated full access on party_addresses"
  on party_addresses for all to authenticated using (true) with check (true);

-- Preserve any existing free-text addresses. Unstructured text can't be parsed
-- into fields reliably, so keep it verbatim in line1 as the primary address.
insert into party_addresses (party_id, label, line1, is_primary, position)
select id, 'Address', address, true, 0
from parties
where address is not null and btrim(address) <> '';

alter table parties drop column address;
