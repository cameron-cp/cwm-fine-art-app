-- Unidentified parties — a holder the dealer knows EXISTS but cannot name.
--
-- The driving case: an advisor has a work; the owner behind them is "private
-- collectors in Palm Beach" and that is all she will ever be told. The advisor
-- edge is easy (a real contact, role='advisor' in artwork_parties/0019). The
-- owner is the problem: there is no party to point role='owner' at.
--
-- The two rejected alternatives, recorded so this isn't re-litigated:
--
--   a) Put it in artwork_parties.notes as free text. Zero schema change, but the
--      owner stops being a node — "what else do these Palm Beach collectors
--      have" becomes unanswerable, which is the exact question 0016/0019 exist
--      to answer. Advisor-mediated works with an opaque owner are the NORMAL
--      case in this market, so the hole would sit where she needs it most.
--   b) Put it in provenance_lines[]. That's tearsheet DISPLAY text about the
--      chain of past ownership, not a claim about who holds the work today.
--
-- So: a real party row, flagged. The payoff is what happens when she learns the
-- name — she renames one row and every edge already hanging off it (the owner
-- link, interests, other works traced to the same collectors) is retroactively
-- correct. No re-keying, no orphans.
--
-- The flag is load-bearing, not cosmetic: EVERY picker that selects a party for
-- an OUTWARD action (invoice a buyer, email a viewing-room recipient, charge a
-- retainer) filters `is_unidentified = false`. Before this column those three
-- queries selected every party unconditionally, so a placeholder row would have
-- been billable and emailable. Internal graph surfaces (Contacts, the
-- relationship counterparty picker, the Registrar chat) still show these rows —
-- they're records she's actively working, not junk.

alter table parties
  add column is_unidentified boolean not null default false;

-- Partial: the flagged rows are the rare set, and every filtered picker reads
-- `= false`, so a plain index would be almost entirely dead weight. Postgres
-- can still use this for the negated predicate via the row estimate.
create index parties_unidentified_idx on parties(id) where is_unidentified;

-- An unidentified party has nobody to bill or email, so it must never hold
-- payment rails. Stripe customer creation is lazy (0013) and keyed off contact
-- pages, which now hide that panel — this is the backstop for any other path.
alter table parties
  add constraint parties_unidentified_no_stripe_customer
    check (not (is_unidentified and stripe_customer_id is not null));
