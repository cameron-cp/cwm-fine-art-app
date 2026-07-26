-- Artwork status: add 'not_for_sale' ---------------------------------------
-- Covers the case where a work is placed and known but not on offer — e.g. it
-- sits in a private collection the dealer tracks, or the owner has withdrawn it.
-- Distinct from 'sold' (a transaction the dealer recorded) and from 'on_hold'
-- (still on offer, reserved). Appended last so existing enum ordinals — and any
-- index/sort built on them — are untouched.

alter type artwork_status add value if not exists 'not_for_sale';
