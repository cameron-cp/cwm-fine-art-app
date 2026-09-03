-- Retainer attention contact — the person she deals with, when the payer is a
-- company.
--
-- The driving case, from the dealer: she is working with Amelia Patt-Zamir, but
-- the counterparty on the retainer is Detroit Design District. Those are two
-- different facts and the row could previously hold only one of them:
--
--   * party_id must be Detroit Design District. That is whose card pays, whose
--     name their accounting needs on the receipt, and therefore which party owns
--     the Stripe Customer (parties.stripe_customer_id, 0013).
--   * Amelia is who she emails, and who should be on the "attention" line — the
--     same distinction invoices already draw with bill_to_name vs.
--     bill_to_attention (0007). Retainers had no equivalent.
--
-- Rejected alternative: make Amelia the party_id and put the company in the
-- description. It reads fine on screen and is wrong everywhere that matters —
-- the Stripe Customer would be a private individual, so the company's receipts
-- carry a person's name, and any later "what is Detroit Design District paying
-- us" is unanswerable because the company is a substring in a text field rather
-- than a node. The relationship between them is already expressible
-- (party_relationships, `employed_by`), so the graph should hold it.
--
-- Nullable on purpose: the common retainer is one person paying for themselves,
-- where an attention contact would be noise. `on delete set null` rather than
-- cascade or restrict — losing the contact card of the person she used to deal
-- with must never delete the retainer or block the deletion; the payer and the
-- charge history are the durable facts.

alter table retainers
  add column attention_party_id uuid references parties(id) on delete set null;

-- Every read of a retainer joins this to render the attention line, and the
-- contact page will want "retainers where I am the attention contact".
create index retainers_attention_party_idx on retainers(attention_party_id)
  where attention_party_id is not null;

-- The attention contact is a DIFFERENT party from the payer. Storing the same
-- one twice would render "Detroit Design District (attn: Detroit Design
-- District)" and silently defeat the email fallback below, which exists to reach
-- a human when the company itself has no inbox.
alter table retainers
  add constraint retainers_attention_party_not_payer
    check (attention_party_id is null or attention_party_id <> party_id);
