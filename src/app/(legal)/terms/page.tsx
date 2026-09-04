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
        standfirst={`${GALLERY_NAME} is an art advisory in Texas, and this application is its private business tool. These terms cover the people who sign in and the clients who open a viewing-room link we send them.`}
      />

      <div className="lg-body">
        <section className="lg-section">
          <h2>Who these terms are for</h2>
          <ul>
            <li>
              <strong>Account holders</strong> — the people the advisory has given sign-in access.
            </li>
            <li>
              <strong>Viewing-room recipients</strong> — a client, collector, or fellow advisor we
              have sent a private link to. You don&rsquo;t have an account and don&rsquo;t need
              one. The room page tells you these terms apply before you see any of it; if you would
              rather not accept them, close the tab and tell us, and we&rsquo;ll send the works
              another way.
            </li>
          </ul>
          <p>
            Most of what follows applies only to account holders. The two sections that concern a
            recipient are <em>viewing-room links</em> and <em>who owns what is on the page</em>.
          </p>
        </section>

        <section className="lg-section">
          <h2>Accounts and access</h2>
          <p>
            We create accounts. There is no sign-up. Sign-in runs through Google, so that Google
            account is the lock on the whole application — put a strong password and two-step
            verification on it. Don&rsquo;t share an account. Tell us at{" "}
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
            rights holders, or to the owners of the works. You may look at them and use them to
            consider a purchase. You may not republish, reproduce, or distribute them, and you may
            not use them to train a machine learning model. The presentation itself — the writing,
            the layout, the records behind it — is ours.
          </p>
        </section>

        <section className="lg-section">
          <h2>Advice is not given here</h2>
          <p>
            This application keeps records and presents works. It is not an advisory relationship.
            Any engagement with {GALLERY_NAME} lives in a separate signed agreement, and nothing a
            page here generates creates one, changes one, or stands in for one. No fiduciary or
            agency duty arises from your use of this application.
          </p>
          <p>
            Values, estimates, and prices are working figures. They are not USPAP appraisals and
            they are not investment, tax, or legal advice. If you need an appraisal, we will help
            you commission one.
          </p>
        </section>

        <section className="lg-section">
          <h2>Invoices and payment</h2>
          <p>
            Invoices and payment pages the application generates are processed by Stripe, and paying
            through one means Stripe&rsquo;s terms apply to that payment as well as ours. Card
            details go to Stripe directly and are never held by us. We aren&rsquo;t responsible for
            Stripe being unavailable. The terms printed on an invoice — payment, title, shipping,
            returns — govern that transaction, and if an invoice and this page ever disagree, the
            invoice wins.
          </p>
          <p>
            Amounts on an invoice are due as stated on it. Taxes, shipping, and any duties are the
            buyer&rsquo;s responsibility unless the invoice says otherwise.
          </p>
        </section>

        <section className="lg-section">
          <h2>AI features</h2>
          <p>
            Parts of the application use AI to answer questions about our own records and to read
            uploaded inventory files into structured fields. Only account holders can use them.
          </p>
          <p>
            They get things wrong. Check anything that will reach a client, a buyer, or an
            accountant before relying on it. We provide these features without warranty of any kind,
            the account holder is responsible for verifying what comes out of them, and reliance on
            an output is at your own risk.
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
            particular purpose, or non-infringement.
          </p>
        </section>

        <section className="lg-section">
          <h2>Limitation of liability</h2>
          <p>
            <strong>What this section covers.</strong> The software, and only the software. If you
            buy a work from us, the invoice governs that sale. If you engage us as an advisor, the
            signed agreement governs that engagement. Nothing in this section limits our obligations
            under either, and nothing here should be read as an attempt to cap what we owe you on a
            transaction.
          </p>
          <p>
            <strong>The limit.</strong> So far as the law allows, {GALLERY_NAME} is not liable for
            indirect, incidental, special, or consequential damages, or for lost profits or lost
            data, arising from your use of the application, and our total liability relating to the
            application is limited to one thousand United States dollars.
          </p>
          <p>
            <strong>What the limit never covers.</strong> Fraud or fraudulent misrepresentation,
            willful misconduct, gross negligence, death or personal injury caused by our negligence,
            infringement of your intellectual property, breach of confidentiality, and anything else
            that cannot lawfully be limited.
          </p>
          <p>
            <strong>Savings.</strong> Nothing in these terms excludes or limits any liability or
            any right that cannot be excluded or limited under the law that applies to you. Where a
            provision here would be unenforceable against you, it applies only so far as the law
            permits, and the rest of these terms stay in force.
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
          <p>
            When a viewing-room link ends, the page stops loading and we stop recording anything
            against it; the record of what was already viewed stays in our files, as described in
            the{" "}
            <Link className="lg-link" href="/privacy">
              privacy policy
            </Link>
            . When an account ends, the records that account created remain ours — they are the
            business&rsquo;s books, not the account holder&rsquo;s.
          </p>
        </section>

        <section className="lg-section">
          <h2>Electronic records</h2>
          <p>
            We send invoices, viewing rooms, and notices electronically, and you agree to receive
            them that way. An electronic signature or a click where we ask for one counts as your
            signature.
          </p>
        </section>

        <section className="lg-section">
          <h2>Governing law</h2>
          <p>
            {GALLERY_NAME} is a Texas business, and these terms are governed by Texas law, without
            regard to its conflict-of-laws rules. Disputes go to the state and federal courts
            sitting in Texas, and you consent to their exclusive jurisdiction — subject to the
            savings clause above, since the law where you live may give you the right to sue closer
            to home.
          </p>
        </section>

        <section className="lg-section">
          <h2>The rest</h2>
          <p>
            If a provision here is held unenforceable, the rest stays in force and the provision is
            narrowed to what the law allows. Not enforcing something once doesn&rsquo;t waive it.
            You may not transfer your rights under these terms; we may transfer ours if the business
            is sold. These terms, plus any invoice or signed agreement between us, are the whole of
            what we have agreed about the application. Neither of us is liable for a failure caused
            by something genuinely outside our control.
          </p>
        </section>

        <section className="lg-section">
          <h2>Contact</h2>
          <p>
            {GALLERY_NAME}, a Texas business —{" "}
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
