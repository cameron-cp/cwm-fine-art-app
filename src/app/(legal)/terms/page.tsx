import type { Metadata } from "next";
import Link from "next/link";

import { GALLERY_NAME } from "@/lib/brand";
import { LegalHeader } from "../legal-header";

export const metadata: Metadata = {
  title: `Terms of use — ${GALLERY_NAME}`,
  description: `The terms that govern use of the ${GALLERY_NAME} advisory application and the private viewing rooms it produces.`,
};

const CONTACT = "chloe@chloewaddington.com";

export default function TermsPage() {
  return (
    <>
      <LegalHeader
        title="Terms of use"
        standfirst={`${GALLERY_NAME} is an art advisory, and this application is its private business tool. These terms cover the two people who sign in and the clients who open a viewing-room link we send them.`}
      />

      <div className="lg-body">
        <section className="lg-section">
          <h2>Who these terms are for</h2>
          <p>Two audiences, and most of what follows applies to only one of them.</p>
          <ul>
            <li>
              <strong>Account holders</strong> — the two people the advisory has given sign-in
              access.
            </li>
            <li>
              <strong>Viewing-room recipients</strong> — a client, collector, or fellow advisor we
              have sent a private link to. You do not have an account and do not need one; opening
              the link means you accept the two sections that concern you,{" "}
              <em>viewing-room links</em> and <em>who owns what is on the page</em>.
            </li>
          </ul>
        </section>

        <section className="lg-section">
          <h2>Accounts and access</h2>
          <p>
            Accounts are created by the advisory. There is no sign-up. Sign-in is through Google,
            and keeping that Google account secure is what keeps the application secure — so use a
            strong password and two-step verification on it. Do not share an account, and tell us at{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            if you think someone else has got in. We can suspend or remove an account at any time.
          </p>
        </section>

        <section className="lg-section">
          <h2>Acceptable use</h2>
          <p>Do not:</p>
          <ul>
            <li>try to reach records, accounts, or pages you were not given access to</li>
            <li>
              probe, scan, or test the security of the application, or work around any limit or
              access control in it
            </li>
            <li>scrape it, or run automated tools against it, without written permission</li>
            <li>upload anything unlawful, or anything you do not have the right to upload</li>
            <li>use it to break a law, or to infringe someone&rsquo;s rights</li>
          </ul>
        </section>

        <section className="lg-section">
          <h2>Viewing-room links</h2>
          <p>
            A viewing room is a private page built for one named recipient. The link is the key: it
            is not a password-protected page, so anyone holding the link can open it. Please treat
            it as confidential and do not forward or publish it. We can revoke a link at any time,
            and links can be set to expire.
          </p>
          <p>
            Prices, availability, and details shown in a viewing room are for your information, are
            subject to change, and are not an offer capable of acceptance. Works shown are often
            held by third parties — artists, galleries, or other owners — and nothing is reserved or
            sold until we confirm it in writing on an invoice.
          </p>
          <p>
            Opening a link records that it was opened and which works were viewed, attributed to the
            contact it was issued to. The{" "}
            <Link className="lg-link" href="/privacy">
              privacy policy
            </Link>{" "}
            explains that in full.
          </p>
        </section>

        <section className="lg-section">
          <h2>Who owns what is on the page</h2>
          <p>
            Artwork images, descriptions, and documents shown to you belong to the artists, to their
            rights holders, or to the owners of the works — not to you. You may view them and use
            them to consider a purchase. You may not republish, reproduce, or distribute them, and
            you may not use them to train a machine learning model. The presentation itself — the
            writing, the layout, the records behind it — is the advisory&rsquo;s.
          </p>
        </section>

        <section className="lg-section">
          <h2>Invoices and payment</h2>
          <p>
            Invoices and payment pages the application generates are processed by Stripe. Card
            details go to Stripe directly and are never held by us. The terms printed on an invoice
            — payment, title, shipping, returns — govern that transaction. If an invoice and this
            page ever disagree, the invoice wins.
          </p>
          <p>
            Amounts on an invoice are due as stated on it. Taxes, shipping, and any duties are the
            buyer&rsquo;s responsibility unless the invoice says otherwise.
          </p>
        </section>

        <section className="lg-section">
          <h2>Advice is not given here</h2>
          <p>
            This application is a record-keeping and presentation tool. Any advisory relationship
            with {GALLERY_NAME} is set out in a separate written agreement, and nothing on a page
            this application generates creates one, changes one, or stands in for one. Values,
            estimates, and prices shown are working figures — they are not appraisals, and they are
            not investment, tax, or legal advice.
          </p>
        </section>

        <section className="lg-section">
          <h2>AI features</h2>
          <p>
            Parts of the application use AI to answer questions about the advisory&rsquo;s own
            records and to read uploaded inventory files into structured fields. These features are
            available only to account holders. They can be wrong, and they are a drafting aid, not
            advice — check anything that will reach a client, a buyer, or an accountant before you
            rely on it.
          </p>
        </section>

        <section className="lg-section">
          <h2>Availability</h2>
          <p>
            The application depends on services we do not run — hosting, database, authentication,
            payments, email, PDF rendering, AI. It may be unavailable, and we do not promise uptime.
            We may change or discontinue any feature. Keep your own copies of anything you cannot
            afford to lose.
          </p>
        </section>

        <section className="lg-section">
          <h2>No warranty</h2>
          <p>
            The application is provided as is and as available, without warranties of any kind,
            express or implied, including any implied warranty of merchantability, fitness for a
            particular purpose, or non-infringement. This does not affect our obligations under a
            signed advisory agreement or the terms of an invoice for a work you actually buy.
          </p>
        </section>

        <section className="lg-section">
          <h2>Limitation of liability</h2>
          <p>
            To the extent the law allows, {GALLERY_NAME} is not liable for indirect, incidental,
            special, or consequential damages, or for lost profits or lost data, arising out of your
            use of the application. Our total liability relating to the application is limited to
            one hundred United States dollars. Again, this limit is about the software; liability
            for an advisory engagement or a sale is governed by the agreement or invoice covering
            it.
          </p>
        </section>

        <section className="lg-section">
          <h2>Changes and ending access</h2>
          <p>
            We may update these terms. The date at the top changes when we do, and that date is set
            by hand rather than by a deployment. Continuing to use the application after a change
            means you accept it. We can suspend or end access — an account or a viewing-room link —
            at any time and for any reason.
          </p>
        </section>

        <section className="lg-section">
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the State of Texas, United States, without
            regard to its conflict-of-laws rules. Disputes go to the state or federal courts located
            in Texas.
          </p>
        </section>

        <section className="lg-section">
          <h2>Contact</h2>
          <p>
            {GALLERY_NAME} —{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . The companion page is our{" "}
            <Link className="lg-link" href="/privacy">
              privacy policy
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
