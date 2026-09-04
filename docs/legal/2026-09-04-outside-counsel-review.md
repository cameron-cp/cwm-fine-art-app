# Outside counsel review — /privacy and /terms

**Reviewed:** the pages shipped in [#50](https://github.com/cameron-cp/cwm-fine-art-app/pull/50) (`dev` @ `ba45e28`)
**Date:** 2026-09-04
**Reviewer:** simulated — see below

> **What this document is.** Nobody at Kirkland & Ellis has seen these pages. This
> is a simulated partner-level review: the critique a senior privacy / tech
> transactions lawyer would be expected to produce, written by Claude. It is not
> legal advice, it is not privileged, and it carries none of the assurance of an
> actual engagement. Treat it as a well-informed punch list that tells you what to
> put in front of real counsel — and how much of their time you will need to buy.
>
> Statutory references are cited from memory and should be verified against current
> text before anyone relies on them.

---

## Scope correction — added 2026-09-04 after owner pushback

The first draft of this memo was overscoped, and the owner was right to say so. Three
facts arrived after it was written: the company is **Texas domiciled**; the only
account holders are Chloe and Cameron; and the owner's understanding was that the
viewing room collects no personal data. The first two are correct and change the
analysis. The third is wrong, and it is the one that matters.

### Verified in the code

**Every viewing-room recipient is a named CRM contact.** `recipientSchema` requires
`party_id: z.string().uuid("Pick a contact")` — [viewing-room.ts:61](../../src/lib/schemas/viewing-room.ts#L61) — and
every row written to `viewing_room_events` carries `recipient_id`, which resolves to
that party — [api/room/[token]/event/route.ts](../../src/app/api/room/%5Btoken%5D/event/route.ts).
The room does not *ask* the visitor for personal data because it already knows exactly
who the visitor is. A `work_view` row is a record that a specific, named person, whose
email and phone number are in `parties`, looked at a specific artwork for a
measurable moment. That is personal data by any definition in play, and it is the
point of the feature rather than an accident of it.

**The beacon writes nothing to the recipient's device.** `RoomTracker` holds an
in-memory `Set` and posts with `fetch` — no cookie, no `localStorage`,
no fingerprint — [room-tracker.tsx](../../src/app/room/%5Btoken%5D/room-tracker.tsx).
This closes the ePrivacy / PECR question left open at P9 **in the advisory's favor**:
storage of or access to information on the device is what triggers consent under
ePrivacy Art. 5(3) and PECR reg. 6, and neither happens here. That is a genuinely good
fact and the policy should say it.

### The conceptual correction

The owner's objection was that the app "does not collect information from users other
than the two." That is true and not the test. Privacy law does not count *users*; it
counts **data subjects** — any identified or identifiable natural person whose data is
processed. The `parties` table is the regulated dataset: names, emails, phone numbers,
mailing addresses, and Chloe's notes about what those people own and want, almost all
of it entered by her without the person ever touching the application. Two accounts,
potentially several hundred data subjects. Every comment below about access requests,
retention, and notice is about them, not about the two of you.

### What actually applies to a Texas-domiciled two-person advisory

| Regime | Applies? | Why |
|---|---|---|
| **Texas breach notification** (Tex. Bus. & Com. Code § 521.053) | **Yes** | Reaches any person conducting business in Texas that owns computerized sensitive personal information. No revenue or headcount exemption. 60-day notice; AG notice at 250+ Texans. **This is the one privacy statute that certainly binds you**, and it is the one the current wording of the Security section over-promises against. |
| **Texas DTPA** (§ 17.46) and **FTC Act § 5** | **Yes** | A published statement that is false is actionable regardless of company size. This is what makes headline item 2 a real problem rather than an editing note. |
| **TDPSA** (Texas Data Privacy and Security Act) | **Effectively no** | Small-business exemption tied to the SBA definition. The residual obligation is consent before selling sensitive data, and there is no sale. |
| **CCPA / CPRA** | **Almost certainly no** | Thresholds are $25M revenue, or PI of 100,000+ consumers/households, or 50%+ of revenue from selling or sharing. None is close. P8 and P11 should be read as *"stop volunteering into this,"* not as compliance gaps. |
| **GDPR / UK GDPR** | **Only on a factual predicate** | Not established in the Union, so Art. 3(2) governs. Art. 3(2)(a) requires *targeting* EU data subjects, and Recital 23 is explicit that an accessible website is not enough. If Chloe does not solicit European clients, the whole block below is dormant. |

### The one way GDPR switches on — and it is the viewing room

Art. 3(2)(b) reaches a controller outside the Union that **monitors the behavior** of
data subjects *in* the Union, and Recital 24 names tracking on the internet to analyze
or predict preferences as the paradigm case. Recording which works a named person
looked at, in order to infer what they are interested in, is that. So: send one
viewing-room link to a collector sitting in London or Paris, and the feature the owner
believed was privacy-neutral is the single most likely trigger for the regime he
believed was overkill. The two objections interact rather than reinforcing each other.

This is not a prediction that it will happen or that anyone will care if it does. It
is the answer to "why is any of this in scope at all," and the answer is one question:
**does she have, or does she want, European clients?** If no, delete the GDPR block and
run the eight-item list below. If yes, it comes back — but as planning for a business
she wants, not as remediation.

### Right-sized list

Independent of every privacy statute above, these hold on contract law, consumer-
protection law, copyright, and Google's developer terms:

1. Nothing links to either page (headline 1) — **contract formation**, not privacy.
2. The security sentence contradicts the vendor table (headline 2) — **DTPA / § 5**.
3. "No profiling" is inaccurate on the facts — downgrade from a GDPR violation to a
   false statement in a published document, which is still headline 2's problem.
4. Name the entity and give an address (P1). Texas domicile now settles the Terms'
   governing-law clause; specify the county (T5).
5. Liability carve-outs, savings clause, severability (T2, T3, T6).
6. Upstream rights in artwork images (T7) — **copyright**, unrelated to privacy.
7. Texas breach-notification alignment in the Security section (P17), which currently
   promises more than § 521.053 requires and with no timeframe.
8. AML/OFAC, **if and only if** there are international clients — same predicate as
   GDPR, and the more consequential of the two.

Everything below this line is the original review. Read the GDPR-dependent comments
(P2, P3, P5, P6, and the Art. 27 reference) as conditional on that one question.
The rest stands.

---

## The three things to fix before anything else

**1. Nothing in the application links to either page.** `grep -rn 'href="/privacy"' src/`
returns hits only inside `src/app/(legal)/` itself. The viewing room footer is
`<footer className="vr-footer">{GALLERY_NAME}</footer>` — [room/[token]/page.tsx:77](../../src/app/room/%5Btoken%5D/page.tsx#L77) — with
no link to anything. The app shell has no footer link. The sign-in page has none.

This is not a cosmetic gap. The Terms say a recipient accepts them by opening a
viewing-room link. A recipient who opens that link is shown no terms, no link to
terms, and no notice that terms exist. Every protective provision in the document —
the warranty disclaimer, the $100 cap, the Texas forum clause, the no-ML-training
restriction — rests on assent that was never obtained and could not have been.
Browsewrap without conspicuous notice is routinely held unenforceable; *Nguyen v.
Barnes & Noble*, 763 F.3d 1171 (9th Cir. 2014), and *Specht v. Netscape*, 306 F.3d 17
(2d Cir. 2002), are the canonical statements. What you have is weaker than browsewrap:
there is no wrap at all.

Fix, in order of cost: (a) link both pages from the room footer, the app footer, and
the sign-in page; (b) put a conspicuous line above the fold of every viewing room —
"By viewing this room you agree to our Terms of Use" with the link rendered as a link;
(c) if the terms are load-bearing for anything valuable, replace it with an
acknowledgment gate on first open and store the timestamp and the version presented.

**2. The Privacy page contradicts itself, and the false half is the security promise.**
"…no one outside the two accounts above can read it." Three sections later, a table
lists seven vendors that read it, one of which receives contact names and your notes
about them so a model can answer questions about them. That sentence is not merely
imprecise; it is an unqualified security representation that a regulator would read
as a Section 5 deceptive-practices hook and a plaintiff would read as a
misrepresentation. Delete it. Replace with: no one outside the two accounts and the
service providers listed below has access, and each is contractually restricted.

**3. "No profiling" is already shaky and goes false the moment M2 ships.** The
document promises "No profiling and no automated decisions that have a legal effect
on anyone." GDPR Art. 4(4) defines profiling as automated processing to evaluate
personal aspects, in particular to analyze or predict personal preferences and
interests. Recording which works a named contact viewed, in order to infer what that
contact is interested in, is profiling on the face of the definition — and
`docs/decisions/0008-viewing-rooms.md` plus the `collector_interests.source =
'inferred_from_engagement'` value already in the schema say that inference is the
roadmap. The second half of the sentence (the Art. 22 formulation on decisions
producing legal effects) is fine and should stay. Strike "No profiling."

---

## Privacy — comments

| # | Severity | Comment |
|---|---|---|
| P1 | **Blocker** | **No controller identified.** The page never says what Chloe Waddington Fine Art *is* — LLC, sole proprietorship, DBA — or gives a postal address. GDPR Art. 13(1)(a) requires the controller's identity and contact details; every US state law expects a legal name. A trade name and an email address are not enough. |
| P2 | **Blocker** | **No Art. 14 delivery path.** Almost every data subject in this system had their data entered *by Chloe*, not supplied by themselves. That makes this an Art. 14 notice, not Art. 13, which means the notice must actually reach the individual (within a month, or at first communication) and must disclose the *source* of the data. A page nobody is directed to satisfies nothing. If EU/UK contacts are in the database, this is the largest single exposure in the review. |
| P3 | **High** | **No transfer mechanism named.** The page says data is held in the United States and stops. Art. 46 requires you to name the safeguard: SCCs, the UK IDTA/Addendum, or reliance on the EU–US Data Privacy Framework where the specific vendor is certified. Check each of the seven, one at a time — certification is per-entity, not per-industry. |
| P4 | **High** | **The residency claim is unverified and probably wrong at the edge.** Netlify serves from a global edge; Clerk, Resend, and Browserless each have their own regions; the Supabase project region was never confirmed (the reviewer could not reach the API). Do not assert US-only processing until every one of those is checked. An inaccurate residency statement is worse than a general one. |
| P5 | **High** | **No lawful basis stated.** Art. 13(1)(c) requires it. For an advisory this is a legitimate-interests case for most processing and contract for invoicing, but it must be written down, and legitimate interests requires a balancing assessment you can produce on request. |
| P6 | **High** | **No supervisory-authority right.** Art. 13(2)(d) requires telling data subjects they may complain to their supervisory authority. Missing entirely. Also missing: Art. 27 EU representative, if the advisory is targeting EU data subjects. |
| P7 | **High** | **The 30-day response commitment is stricter than every statute that binds you.** GDPR is one month extendable by two; CCPA is 45 days extendable to 90. You have volunteered a deadline you can miss on holiday. Say you will respond "within the time the applicable law allows, and as promptly as we can." |
| P8 | **High** | **Voluntarily extending statutory rights to everyone, globally, with no carve-outs.** "We extend them to everyone, so you do not need to cite a statute to ask" is admirable and enforceable against you. Extend them as a matter of practice; do not promise them in the document. At minimum add the standard carve-outs (verification of identity, manifestly unfounded or excessive requests, third-party rights, legal holds). |
| P9 | **Medium** *(was High)* | **Partly resolved — see the scope correction.** The beacon writes nothing to the recipient's device, so ePrivacy Art. 5(3) / PECR reg. 6 are not triggered; say so in the policy. The CIPA exposure below is not eliminated but is smaller than drafted, since there is no third-party pixel and no session replay. Original comment follows. **Viewing-room capture is the current litigation fact pattern.** Tying page-view events to an identified person on a logged-out surface, with no consent, is the shape of the CIPA and wiretapping/session-replay class actions (Cal. Penal Code §§ 631, 632.7) that have been filed by the thousand. That most of those suits are weak is not the point; the settlement value is. Separately, in the EU/UK, any storage of or access to information on the recipient's device requires consent under ePrivacy Art. 5(3) / PECR reg. 6 regardless of whether it is a "cookie." Confirm what the beacon in `room-tracker.tsx` actually writes to the device. If it writes nothing, say so in the policy — it is a genuinely good fact. |
| P10 | **Medium** | **"Sell" and "share" are used colloquially.** Under CPRA, "share" is a defined term meaning cross-context behavioral advertising, and "sale" reaches any disclosure for valuable consideration, not just disclosure for marketing. The qualifier "for anyone else's marketing" narrows your denial in a way that reads as a hedge. Use the statutory formulation: you do not sell or share personal information as those terms are defined under the CCPA. |
| P11 | **Medium** | **Confirm CCPA even applies.** The thresholds are $25M gross annual revenue, or buying/selling/sharing the personal information of 100,000+ consumers or households, or deriving 50%+ of revenue from selling or sharing it. A two-person advisory almost certainly clears none of them. You may be volunteering into a regime that does not reach you — which is a defensible choice, but make it knowingly. |
| P12 | **Medium** | **The retention section is not a retention schedule.** "As long as the advisory needs them" is exactly the formulation Art. 13(2)(a) is written to preclude. Give a period or the criteria used to determine one, per category. Also, "tax and accounting rules require, generally at least seven years" overstates the rule — the IRS baseline is three years, six for substantial omissions. Seven is prudent practice, not a requirement; say that. |
| P13 | **Medium** | **You are representing a third party's contract terms to consumers.** "Under Anthropic's commercial terms, content sent through their API is not used to train their models" is true today and becomes a misrepresentation the day it changes, without any act by you. Reframe as your own commitment: "Our agreement with Anthropic prohibits the use of this content to train its models." Separately, confirm the retention position — not training and not retaining are different claims, and you have wisely not made the second one; keep it that way. |
| P14 | **Medium** | **The AI section understates what goes to Anthropic.** "The records needed to answer it" is technically accurate and rhetorically evasive. The chat reads contacts and Chloe's private notes about them. Say that plainly: contacts' names and our notes about them may be sent. |
| P15 | **Medium** | **The named-vendor table is a standing maintenance obligation.** GDPR requires categories of recipients, not names. Naming them is a real transparency win for a business like this and I would keep it — but an out-of-date table is itself a misstatement. Add "as of the date above," and put a check on the release checklist. The comment in `privacy/page.tsx` already says this to future engineers, which is the right instinct. |
| P16 | **Medium** | **"We did not buy your information from anyone" is an absolute historical claim** that becomes false the first time an art-fair lead list is imported. Qualify it or drop it. |
| P17 | **Low** | **Breach notification is promised without qualification or timeframe.** "If something goes wrong in a way that affects you, we will tell you" commits you beyond the statutory triggers. Tie it to the applicable law's threshold and timing. |
| P18 | **Low** | **Children: 16 is the GDPR Art. 8 ceiling, not the COPPA line (13).** Sixteen is the conservative choice and fine. No change needed; noted so nobody "fixes" it downward. |
| P19 | **Low** | **No version history.** For a document you may one day need to prove the contents of on a given date, keep prior versions. |
| P20 | **Nit** | **Publishing "two people have accounts" tells an attacker exactly how many credentials stand between them and the whole database.** It is charming and it is reconnaissance. Say "a small number of authorized users." |

---

## Terms — comments

| # | Severity | Comment |
|---|---|---|
| T1 | **Blocker** | **No acceptance mechanism.** See headline item 1. Everything below is academic until this is fixed. |
| T2 | **Blocker** | **The liability cap has no carve-outs and will be read as overreaching.** A cap that purports to reach fraud, willful misconduct, death or personal injury, IP infringement, breach of confidentiality, and indemnity obligations is unenforceable in several jurisdictions and invites a court to strike the clause rather than blue-pencil it. Add the standard carve-outs and, critically, a savings clause: nothing limits liability that cannot lawfully be limited. |
| T3 | **Blocker** | **No consumer carve-out, and your counterparties are frequently consumers.** A blanket "no warranties of any kind" plus a $100 cap is void as against UK and EU consumers (Consumer Rights Act 2015; UCTA 1977). Private collectors buying art for themselves are consumers. The savings clause in T2 is the minimum fix. |
| T4 | **High** | **The $100 cap does the wrong work.** For a business whose transactions run to six and seven figures, the cap is sensible *for the software* — but the sentence carving out "an advisory engagement or a sale" is carrying an enormous load in one clause. A buyer who relies on a misstated price or provenance in a viewing room will plead the sale, not the software, and a court may read the cap as an attempt to reach that claim and void the whole thing. Separate the two expressly, and make the software cap subordinate to the invoice and the advisory agreement rather than parallel to them. |
| T5 | **High** | **Forum selection is imprecise and may be unenforceable against foreign consumers.** "Courts located in Texas" does not say which, or whether jurisdiction is exclusive. Name the county and say exclusive. Then note the limit: under Brussels I recast Art. 18, an EU-domiciled consumer may generally only be sued where they are domiciled, and a pre-dispute forum clause will not fix that. Consider arbitration with a class waiver and a carve-out for injunctive relief — for a two-person shop facing high-value counterparties, that is usually the right trade. |
| T6 | **High** | **No boilerplate.** There is no entire-agreement clause, no severability, no assignment, no waiver, no notices provision, no force majeure, no survival. Severability is the one that matters most here: without it, a single unenforceable clause (see T2, T3) risks more than itself. |
| T7 | **High** | **No upstream rights representation.** The Terms tell recipients what they may not do with the images. They never establish that the advisory has the right to display them. Copyright subsists in the underlying work (artist) and separately in the photograph (photographer). Offering a work for sale gives you a good argument, not a license. The question for the client is not the downstream restriction — it is what her consignment and artist agreements actually grant. |
| T8 | **Medium** | **The ML-training restriction needs a machine-readable counterpart.** Under the EU DSM Directive Art. 4(3), a text-and-data-mining reservation must be expressed in machine-readable form for online content. A sentence in the Terms does not reserve the right against an EU-based crawler. Add the reservation to `robots.txt` and to page metadata. Note that viewing rooms are already `noindex`, which helps but is not the same reservation. |
| T9 | **Medium** | **Strengthen the advisory disclaimer.** The "Advice is not given here" section is the best-drafted part of either document and should go further: state that no fiduciary or agency relationship arises from use of the application, and that valuations shown are not USPAP-compliant appraisals. |
| T10 | **Medium** | **The AI section disclaims advice but does not allocate risk.** Add that outputs are provided without warranty, that the account holder is responsible for verifying anything that reaches a client or an accountant, and that reliance on an output is at the user's risk. |
| T11 | **Medium** | **Nothing addresses what happens on termination** — to a recipient's access, to an account holder's data, or to records already generated. |
| T12 | **Medium** | **No indemnity.** Low priority as against the two account holders; worth having as against a recipient who republishes an artist's images. |
| T13 | **Low** | **Stripe.** Say that payment is also subject to Stripe's terms and that the advisory is not liable for Stripe's availability. |
| T14 | **Low** | **No E-SIGN consent.** Invoices are delivered electronically. A consent-to-electronic-records-and-signatures clause is one sentence and standard. |
| T15 | **Low** | **DMCA agent.** The application hosts third-party artwork images. Section 512(c) safe harbor requires a designated agent (a $6 filing). Note the limit: 512(c) covers material stored *at the direction of a user*, and here the operator uploads, so the safe harbor may not reach you at all. Cheap enough to do regardless. |

---

## Outside the four corners of the documents

These are not drafting comments. They are the things a partner raises after the
markup, and at least one of them is more consequential than everything above.

**Anti-money laundering.** An art advisory transacting with European clients is
likely an "art market participant." The EU brought art market participants into the
AML regime for transactions at or above €10,000 (5AMLD, Directive (EU) 2018/843), and
the UK requires AMPs to register with HMRC and run customer due diligence under the
Money Laundering Regulations 2017 as amended. In the US, AMLA 2020 pulled *antiquities*
dealers into the BSA and Treasury's 2022 study left the broader art market outside it
for now — but "for now" is doing work in that sentence. Neither document says anything
about this, which is correct, because it is not a terms-of-use problem. It is a
"does this business have a compliance program" problem, and the answer needs to be yes
before it needs to be documented.

**Sanctions screening.** OFAC liability is strict, has no de minimis threshold, and
does not care that you are two people. Counterparty screening should be a step in the
invoice flow, not a policy sentence.

**Web accessibility.** These are now the business's only public-facing pages. ADA
Title III website claims are a volume practice. WCAG 2.1 AA is the target. The design
here is unusually type-driven; check contrast ratios on `--ink-3` against `--paper`
in both themes specifically, since muted-on-plaster is where that system will fail.

**Google OAuth verification.** Worth confirming you need it. The Limited Use
requirements attach to Sensitive and Restricted scopes; `openid`, `email`, and
`profile` are none of those, and an app under the unverified-user cap with only basic
scopes may not require the assessment at all. The scope disclosure in the policy is
well done and should stay either way — it is exactly what a reviewer wants to see —
but confirm current Google policy before spending time on a verification you may not
owe.

---

## What is right, and should not be "fixed"

A review that only lists problems misleads. These are deliberate choices that a
partner would leave alone:

- **The hand-edited `LEGAL_LAST_UPDATED` constant.** A date that moves on every
  deploy is affirmatively harmful — it destroys your ability to say what the policy
  said on a given day. Sourcing it from a constant is the correct engineering answer
  to a legal problem, and the comment in `last-updated.ts` explains why to the next
  engineer. Keep it.
- **Disclosing the viewing-room capture at all.** The easy move was silence. Writing
  it down, next to the "no tracking pixels" claim, is what makes the rest of the
  document credible. It creates the exposure at P9, and it is still the right call.
- **The named processor table.** Unusual, and better than "categories of recipients
  such as hosting and analytics providers."
- **The scope-limit paragraph.** Naming the three scopes and stating what you cannot
  read is the single most persuasive paragraph in either document.
- **Plain English throughout.** Do not let anyone convert this back into legalese in
  the course of fixing the substantive gaps. The defects above are gaps in coverage,
  not failures of register.

---

## Punch list

**Before the next client sees a viewing room**

1. Link `/privacy` and `/terms` from the room footer, the app footer, and sign-in.
2. Add conspicuous terms notice above the fold in the viewing room.
3. Delete "no one outside the two accounts above can read it."
4. Delete "No profiling" from the "What we do not do" list.
5. Name the legal entity and give a postal address on both pages.

**Housekeeping, on any scoping**

6. Add severability, a savings clause, and liability carve-outs to the Terms (T2, T3, T6).
7. Specify the Texas county and exclusivity in the forum clause (T5).
8. Align the Security section with Tex. Bus. & Com. Code § 521.053 rather than promising
   open-ended notification (P17).
9. State that the viewing-room beacon stores nothing on the recipient's device — now
   verified, and worth saying.
10. Soften the 30-day and global-rights commitments (P7, P8), or drop the voluntary
    CCPA extension entirely.
11. Establish what Chloe's consignment and artist agreements actually license, before
    worrying about what recipients may do with the images (T7).

**Only if there are, or will be, international clients**

12. Determine whether EU/UK data subjects are in the database. If yes: Art. 14
    delivery, lawful basis, transfer mechanism, supervisory-authority right, retention
    schedule, and possibly an Art. 27 representative.
13. Confirm actual processing regions for all seven vendors; correct the residency
    statement (P4).
14. Establish whether the advisory is an art market participant under UK/EU AML rules.

~~12. Confirm what `room-tracker.tsx` writes to the recipient's device.~~ **Done** — it
writes nothing. See the scope correction.

**Then** take the marked-up documents to real counsel — but items 1–11 are an
afternoon of engineering and drafting, and items 12–14 do not exist until the answer to
one question is yes. Ask that question first; it determines whether this is a $2,000
review or a $25,000 one.

---

# Appendix — AI-writing tells

A separate axis from the legal review, and worth its own pass. Both pages were
drafted by a model, and they read like it. That matters here for a specific reason:
the documents' whole strategy is candor. They name seven vendors, admit the
viewing-room capture, and state the OAuth scope limit — moves that only pay off if a
reader believes a person stands behind them. Prose that reads as machine-generated
undercuts exactly the trust the transparency was meant to buy.

Numbers below are measured from the shipped files.

## Measured

| Signal | Privacy | Terms | This memo | Edited human prose |
|---|---|---|---|---|
| Words (prose only) | ~1,214 | ~948 | ~3,152 | — |
| Em dashes | 13 | 17 | 27 | — |
| Em-dash density | 1 per 93 w | **1 per 56 w** | 1 per 117 w | ~1 per 800–1,000 w |
| Contractions | **0** | **0** | 16 | frequent in plain register |
| Mean sentence length | 20.1 | 19.8 | 20.1 | varies by author and section |
| Sentences under 8 words | 5 of 63 | 3 of 49 | 12 of 168 | — |

Three things fall out of that table.

**The em-dash rate is the loudest signal.** One every 56 words in the Terms is roughly
fifteen times ordinary published density. The construction is almost always the same:
a noun, a dashed appositive, then the verb. *"What Google gives us — an account
identifier, an email address, a name, and a profile picture — is used only to sign
that person in."* Once per page is a stylist's choice. Seventeen times is a default.

**Zero contractions across 2,162 words, in a document that advertises its own plainness.**
The privacy page alone contains "do not" six times, "it is" six times, "we will"
three times, "cannot" once — and never once "don't," "it's," or "we'll." Formal
register wearing plain-English clothes. A human writing genuinely plainly contracts
without thinking about it.

**Mean sentence length of 20.1, 19.8, and 20.1 words across three documents with
different purposes and audiences.** That convergence is the fingerprint. Human writers
drift — a section they care about runs long, a section they resent runs clipped. These
don't drift.

## Structural

**Announced enumeration.** The privacy page opens a section with *"Two groups of
people."* The terms page opens with *"Two audiences, and most of what follows applies
to only one of them."* Same move, two documents — pre-declaring a structure the list
immediately makes obvious. Cut both sentences and nothing is lost.

**Section-mass uniformity.** Nearly every section is one to three paragraphs of
comparable length. Real policies are lumpy: the clause that got someone sued runs four
hundred words and the one nobody has ever thought about runs eleven. The evenness here
signals that every section was generated to the same brief rather than accreted over
time by different pressures.

**Every section lands on a balancing clause.** Security closes on *"No system is
perfect; if something goes wrong in a way that affects you, we will tell you."*
Retention closes on *"Anything else is deleted once it is no longer useful."* The
pattern — assert, then soften, then reassure, in that order, every time — is the
single most recognizable rhythm in model-written prose.

## Sentence-level

| Pattern | Instance | Fix |
|---|---|---|
| Anaphoric quadruple | *"It is never used for advertising, never sold, never transferred to anyone except the service providers listed below, and never used to train an AI model."* | Two sentences. Drop two of the four "never"s. |
| Tricolon crescens | *"…what that application holds, who else touches it, and how to ask us to change or delete something."* Three items, each longer than the last. | Two items, or three of uneven weight. |
| Self-advertised plainness | *"This page says **plainly** what…"* | Delete the word. Plain writing does not announce itself; claiming clarity is what unclear writing does. |
| Colon as drumroll | *"The link is the key: it is not a password-protected page…"* | *"The link is the key. Anyone who has it can open the room."* |
| Semicolon concession | *"No system is perfect; if something goes wrong…"* | Full stop. The semicolon is doing rhetorical work, not grammatical. |
| The negation flip | *"they are a drafting aid, not advice"* — and, in the commit message, *"first-party record-keeping, not a tracking pixel."* | Cameron's own banned-strings list catches this construction. State the positive and stop. |
| "The one X is Y" | *"The one limit on deletion is records we are legally required to keep."* | *"We keep completed invoices even if you ask us to delete the rest."* |
| Discourse marker | *"**Again,** this limit is about the software"* | Delete. If the reader needed it repeated, restructure. |
| Coined authority | *"first-party record-keeping"* | Real term of art adjacent, but not one. Say what happens: *"we record it ourselves and it goes nowhere else."* |

## What is missing, which is also a tell

**Fluent about categories, silent about particulars.** No entity type, no address, no
phone number, no named individual, no jurisdiction of formation. The only concrete
figure in either document is the $100 liability cap, which is a round default rather
than a number anyone reasoned toward. This overlaps with comment P1, but the diagnosis
differs: there the problem is a missing legal disclosure, here it is that the prose
never touches ground. Models write confidently about shapes and vaguely about facts.

**No idiosyncrasy.** Nothing in either document could only have been written by an art
advisory. There is no art fair, no consignment note, no condition report on arrival, no
crate, no artist estate. Swap "artwork" for "listing" and the privacy page would serve
a real-estate brokerage unchanged. Sector-specific texture is the cheapest and most
reliable way to break the pattern — and it makes the documents more accurate, not less.

**Symmetric hedging.** Every strong claim is followed by a qualifier of roughly its own
length. That balance is a stylistic reflex, not a considered position, and in a legal
document it occasionally hedges something that should have been flat (P2, P9) while
leaving flat something that should have been hedged (the security promise in headline
item 2).

## Where the tells are worst, and where they aren't

**Worst:** the privacy standfirst and the "Security" section. Both are pure connective
prose with no facts to anchor them, which is where the default cadence takes over
completely.

**Least:** the processor table (data resists style — the tell cannot survive a column
of vendor names), the OAuth scope paragraph (three named scopes and a list of services
you cannot read; specifics carry it), and "Advice is not given here," which has a real
argument to make and makes it.

The lesson is consistent: **the tells vanish wherever the text has something specific
to say.** Fixing the writing and fixing comment P1 are the same work.

## De-telling pass — concrete

1. Cut em dashes by two-thirds. Most become commas; several become full stops.
2. Contract. "We don't sell your information." "You can't be signed in without it."
3. Break the 20-word rhythm deliberately. Aim for a dozen sentences under eight words.
4. Delete "plainly" from the standfirst, and "Again," from the Terms.
5. Delete both announced-enumeration openers.
6. Add the particulars from P1 — entity, address — plus two or three facts only this
   business would state.
7. Read it aloud. Anywhere a sentence ends on a reassuring clause, cut the clause.

Do this **after** the substantive fixes, not before. Rewriting prose that is about to
change is wasted effort, and several of the worst-reading sentences (the security
promise, "No profiling") are being deleted outright for unrelated reasons.

## And this memo

Written by the same model, and it carries the same fingerprint: 27 em dashes, mean
sentence length 20.1, the identical assert-soften-reassure cadence. Specific instances,
so the point isn't made at the documents' expense alone:

- *"A review that only lists problems misleads."* — freestanding aphorism as a section
  opener, a construction that sounds earned and isn't.
- *"That most of those suits are weak is not the point; the settlement value is."* —
  semicolon antithesis, the memo's most-repeated move.
- *"…and at least one of them is more consequential than everything above."* — a tease
  before the AML section, structuring the reader's attention theatrically.
- *"…but 'for now' is doing work in that sentence."* — self-satisfied, and the sort of
  line that reads as insight while adding no information.
- The Blocker/High/Medium/Low/Nit ladder itself, applied with suspicious evenness
  across two documents of very different quality.

Weight the memo's judgment accordingly. The statutory citations and the two verifiable
findings — that nothing links to the pages, and that the security sentence contradicts
the vendor table — hold up on their own evidence. The confident register around
everything else is a style, not a credential.
