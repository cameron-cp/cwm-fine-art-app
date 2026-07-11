-- Web presence for a contact: a general website and a LinkedIn profile. Both
-- apply equally to a person (personal site / individual profile) or an
-- organization (company site / company page). Free-text URLs, validated in the
-- app layer (Zod) rather than the DB so a bad paste fails with a clear message.

alter table parties add column website_url text;
alter table parties add column linkedin_url text;
