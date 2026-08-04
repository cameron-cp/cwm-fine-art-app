# 0012 — Artwork search indexes identity, not scholarly apparatus

Status: accepted (2026-08-04)

## Context

Migration `0021` gave `artworks` a denormalized `search_text` haystack, a GIN
trigram index over it, and `search_artworks()`. The haystack is built by
`artwork_search_haystack(artist_name, title, year, medium, edition, id)` — six
identity fields, lowercased and unaccented, plus the first 8 characters of the id
as the short ref the picker shows when one artist has two works with the same
title.

Migration `0023` then added `artworks.exhibited`, a free-text exhibition history
rendered as its own tearsheet section. It is not in the haystack, which raises
the obvious question of whether that is an oversight.

It is not. `provenance_lines`, `literature`, `condition` and `notes` are all
excluded the same way, and several of them are returned by `search_artworks()`
without being searchable. The search exists to answer "find me this work" for the
invoice line-item picker, not to search across everything recorded about a work.

## Decision

`exhibited` stays out of the search index, and so does the rest of the scholarly
apparatus. The haystack remains the six identity fields.

Four reasons:

1. **Scope.** Artist, title, year, medium, edition and the short ref are handles
   for retrieving a known work. Exhibition history describes a work you have
   already found.

2. **Coherence.** Whoever wants to search exhibition text wants to search
   literature and provenance in the same breath. Adding `exhibited` by itself
   would leave the other two invisible and make the gap look deliberate, which is
   worse than a clean line at identity fields.

3. **Precision.** `exhibited` is long prose thick with gallery and institution
   names. In a trigram haystack those names become matches: a search for
   "Gagosian" meant to find a gallery-held work would return every work ever shown
   at Gagosian. The picker is chosen from by hand, so precision beats recall.

4. **Cost.** `search_text` is trigger-stamped on write, so widening the haystack
   requires a new migration plus a re-stamp of every existing artwork. Real work
   for a search nobody has asked for.

## What would reverse this

The dealer trying to search by exhibition and not finding it. That is the signal,
and the response is to widen the haystack to the whole scholarly set at once
rather than field by field.

## Mechanics, if it is revisited

`0021` is already applied to the remote database, so editing that file changes
nothing. A new migration has to:

- `create or replace function artwork_search_haystack(...)` with the added
  arguments, and
- update all three call sites, since a Postgres function body does not track a
  signature change: `artworks_stamp_search_text()` (the write trigger),
  `artists_restamp_artwork_search_text()` (re-stamps a renamed artist's works),
  and the one-shot backfill `update artworks` at the end of `0021`.
- re-stamp every existing row. Without it the new fields stay unsearchable on all
  current inventory, because the trigger only fires when a row is written.

Whether `search_artworks()` should also *return* `exhibited` in its result
columns is a separate question from whether it is indexed, and can be answered on
its own.
