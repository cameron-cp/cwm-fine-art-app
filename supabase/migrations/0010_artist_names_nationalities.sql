-- Structured artist names + nationalities.
--
-- Two problems with the original free-text artist fields:
--   1. A single `name` can't carry a filing order. Sorting by `name` files
--      "Pablo Picasso" under P. We add `sort_name` (the filing key,
--      "Picasso, Pablo") — auto-derived but editable, because no algorithm gets
--      KAWS (mononym), Guerrilla Girls (collective), or family-name-first
--      cultures right.
--   2. Free-text `nationality` drifts (American / America / USA / United States)
--      and can't be multiple. We replace it with `artist_nationalities`: ordered
--      ISO 3166-1 alpha-2 codes (position 0 = primary), so a French-American is
--      two rows and the byline renders "French-American".
--
-- Consistent with `party_addresses.country_code` (migration 0008), country codes
-- are stored as bare ISO text validated in the app — no `countries` reference
-- table, names/demonyms resolved app-side.

-- 1. sort_name --------------------------------------------------------------

alter table artists add column sort_name text;

-- Backfill: normalize whitespace, then "given... surname" -> "surname, given...".
-- The regex only matches when there is at least one space, so mononyms (no space)
-- pass through unchanged. Hyphenated surnames are a single token and stay intact.
update artists a
set sort_name = regexp_replace(btrim(regexp_replace(a.name, '\s+', ' ', 'g')), '^(.*) (\S+)$', '\2, \1');

alter table artists alter column sort_name set not null;

create index artists_sort_name_idx on artists(sort_name);

-- 2. artist_nationalities ---------------------------------------------------

create table artist_nationalities (
  artist_id uuid not null references artists(id) on delete cascade,
  country_code text not null,       -- ISO 3166-1 alpha-2, validated app-side
  position int not null default 0,  -- 0 = primary; drives "Cuban-American" order
  primary key (artist_id, country_code)
);

alter table artist_nationalities enable row level security;
create policy "authenticated full access on artist_nationalities"
  on artist_nationalities for all to authenticated using (true) with check (true);

-- Best-effort migration of the existing free-text nationality into codes. Covers
-- the common demonyms, country names, and abbreviations; anything unmatched is
-- reported below (not silently kept) and then dropped along with the column.
insert into artist_nationalities (artist_id, country_code, position)
select a.id, m.code, 0
from artists a
join (values
  ('american','US'),('america','US'),('usa','US'),('u.s.','US'),('us','US'),('united states','US'),('united states of america','US'),
  ('british','GB'),('britain','GB'),('uk','GB'),('u.k.','GB'),('united kingdom','GB'),('english','GB'),('england','GB'),('scottish','GB'),('welsh','GB'),
  ('french','FR'),('france','FR'),
  ('german','DE'),('germany','DE'),
  ('italian','IT'),('italy','IT'),
  ('spanish','ES'),('spain','ES'),
  ('dutch','NL'),('netherlands','NL'),('holland','NL'),
  ('belgian','BE'),('belgium','BE'),
  ('swiss','CH'),('switzerland','CH'),
  ('austrian','AT'),('austria','AT'),
  ('swedish','SE'),('sweden','SE'),
  ('norwegian','NO'),('norway','NO'),
  ('danish','DK'),('denmark','DK'),
  ('finnish','FI'),('finland','FI'),
  ('irish','IE'),('ireland','IE'),
  ('portuguese','PT'),('portugal','PT'),
  ('greek','GR'),('greece','GR'),
  ('polish','PL'),('poland','PL'),
  ('czech','CZ'),('russian','RU'),('russia','RU'),
  ('ukrainian','UA'),('ukraine','UA'),
  ('romanian','RO'),('romania','RO'),
  ('hungarian','HU'),('hungary','HU'),
  ('canadian','CA'),('canada','CA'),
  ('mexican','MX'),('mexico','MX'),
  ('brazilian','BR'),('brazil','BR'),
  ('argentine','AR'),('argentinian','AR'),('argentina','AR'),
  ('chilean','CL'),('chile','CL'),
  ('colombian','CO'),('colombia','CO'),
  ('cuban','CU'),('cuba','CU'),
  ('venezuelan','VE'),('venezuela','VE'),
  ('peruvian','PE'),('peru','PE'),
  ('chinese','CN'),('china','CN'),
  ('japanese','JP'),('japan','JP'),
  ('korean','KR'),('south korean','KR'),('korea','KR'),
  ('indian','IN'),('india','IN'),
  ('vietnamese','VN'),('vietnam','VN'),
  ('thai','TH'),('thailand','TH'),
  ('filipino','PH'),('philippines','PH'),
  ('indonesian','ID'),('indonesia','ID'),
  ('taiwanese','TW'),('taiwan','TW'),
  ('israeli','IL'),('israel','IL'),
  ('lebanese','LB'),('lebanon','LB'),
  ('iranian','IR'),('iran','IR'),
  ('turkish','TR'),('turkey','TR'),
  ('egyptian','EG'),('egypt','EG'),
  ('moroccan','MA'),('morocco','MA'),
  ('nigerian','NG'),('nigeria','NG'),
  ('ghanaian','GH'),('ghana','GH'),
  ('kenyan','KE'),('kenya','KE'),
  ('south african','ZA'),('south africa','ZA'),
  ('ethiopian','ET'),('ethiopia','ET'),
  ('australian','AU'),('australia','AU'),
  ('new zealand','NZ'),('new zealander','NZ')
) as m(label, code) on lower(btrim(a.nationality)) = m.label
where a.nationality is not null;

do $$
declare r record;
begin
  for r in
    select distinct a.nationality
    from artists a
    where a.nationality is not null and btrim(a.nationality) <> ''
      and not exists (select 1 from artist_nationalities an where an.artist_id = a.id)
  loop
    raise notice 'Unmapped artist nationality dropped (re-tag in the app): %', r.nationality;
  end loop;
end $$;

alter table artists drop column nationality;
