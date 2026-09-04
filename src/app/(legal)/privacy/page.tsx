import type { Metadata } from "next";
import Link from "next/link";

import { GALLERY_NAME } from "@/lib/brand";
import { LegalHeader } from "../legal-header";

export const metadata: Metadata = {
  title: `Privacy — ${GALLERY_NAME}`,
  description: `How ${GALLERY_NAME} handles information in its private art advisory application.`,
};

const CONTACT = "chloe@chloewaddington.com";

// Every processor the app actually talks to. Keep this in step with the code:
// adding a vendor that touches records means adding a row here.
const PROCESSORS = [
  {
    name: "Clerk",
    purpose: "Sign-in and sessions",
    data: "Account identifier, email address, name, sign-in times",
  },
  {
    name: "Supabase",
    purpose: "Database and file storage",
    data: "All records described above, including artwork images",
  },
  {
    name: "Netlify",
    purpose: "Hosting",
    data: "Ordinary web request logs — IP address, page requested, timestamp",
  },
  {
    name: "Stripe",
    purpose: "Invoice payments",
    data: "Buyer name, email, amount, payment details. Card numbers go to Stripe directly and are never stored in our database",
  },
  {
    name: "Resend",
    purpose: "Outgoing email",
    data: "Recipient address and the contents of the message sent",
  },
  {
    name: "Browserless",
    purpose: "Rendering PDFs (tearsheets, invoices, viewing-room documents)",
    data: "The contents of the document being rendered, at the moment it is rendered",
  },
  {
    name: "Anthropic",
    purpose: "AI features (see below)",
    data: "The text of a question and the records needed to answer it",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <LegalHeader
        title="Privacy"
        standfirst={`${GALLERY_NAME} is an art advisory in Texas. It runs a private application to keep its records: works, contacts, invoices. Here is what that application holds and who else can see it.`}
      />

      <div className="lg-body">
        <section className="lg-section">
          <h2>What this application is</h2>
          <p>
            {GALLERY_NAME}
            {" is a Texas business, and this is its internal tool. A small number of "}
            authorized people can sign in. There is no public sign-up and no client log-ins. We
            don&rsquo;t advertise, we don&rsquo;t run a marketplace, and we don&rsquo;t sell or
            share personal information — including as those words are defined under California law.
          </p>
        </section>

        <section className="lg-section">
          <h2>Whose information is in it</h2>
          <p>Two groups of people.</p>
          <ul>
            <li>
              <strong>The people who sign in.</strong> Their name, email address, and the Google
              account used to sign in.
            </li>
            <li>
              <strong>People the advisory works with</strong>
              {" — "}collectors and clients, artists, galleries, consignors, buyers. Their name,
              email address, phone number, mailing address, and the advisor&rsquo;s own notes about
              works they own, have owned, or have shown interest in.
            </li>
          </ul>
          <p>
            Most of the second group never touch this application. Chloe enters what she needs to do
            her job, the way she would have written it in a book. You&rsquo;re in here because
            you&rsquo;re a contact of hers. We haven&rsquo;t bought your details from a list broker,
            and access is limited to the people who sign in and the service providers listed below.
          </p>
        </section>

        <section className="lg-section">
          <h2>What we store</h2>
          <ul>
            <li>
              Artwork records — artist, title, year, medium, dimensions, edition, condition,
              provenance, price, status, and private notes
            </li>
            <li>Photographs of artworks</li>
            <li>Contacts, as described above, and their relationships to works</li>
            <li>Invoices, retainers, and payment records</li>
            <li>Viewing-room activity, described in its own section below</li>
            <li>Sign-in records kept by our authentication provider</li>
          </ul>
        </section>

        <section className="lg-section">
          <h2>Signing in with Google</h2>
          <p>
            The application uses Google to sign people in. We request three scopes and no others:{" "}
            <strong>openid</strong>, <strong>email</strong>, and <strong>profile</strong>. That is
            enough to confirm who is signing in and to show a name and email address inside the app.
            We do not request and cannot read Gmail, Drive, Calendar, Google Contacts, Photos, or
            any other Google service.
          </p>
          <p>
            What Google gives us — an account identifier, an email address, a name, and a profile
            picture — is used only to sign that person in and identify their account. It is never
            used for advertising, never sold, never transferred to anyone except the service
            providers listed below, and never used to train an AI model.
          </p>
          <p>
            Our use of information received from Google APIs follows the{" "}
            <a
              className="lg-link"
              href="https://developers.google.com/terms/api-services-user-data-policy"
              rel="noreferrer"
              target="_blank"
            >
              Google API Services User Data Policy
            </a>
            , including its Limited Use requirements. You can disconnect the application from your
            Google account at any time at{" "}
            <a
              className="lg-link"
              href="https://myaccount.google.com/permissions"
              rel="noreferrer"
              target="_blank"
            >
              myaccount.google.com/permissions
            </a>
            .
          </p>
        </section>

        <section className="lg-section">
          <h2>Companies that process data for us</h2>
          <p>
            Each is a vendor we pay to provide part of the service, and none may use our
            information for its own purposes. This list is current as of the date at the top of
            this page; we update it when we change a vendor.
          </p>
          <div className="lg-table-wrap">
            <table className="lg-table">
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">What it does</th>
                  <th scope="col">What it sees</th>
                </tr>
              </thead>
              <tbody>
                {PROCESSORS.map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td>{p.purpose}</td>
                    <td>{p.data}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            We also disclose information when the law requires it, and we would tell you first
            unless we are barred from doing so.
          </p>
        </section>

        <section className="lg-section">
          <h2>AI features</h2>
          <p>
            Two parts of the application use Anthropic&rsquo;s API. One answers the advisor&rsquo;s
            questions about her own records — &ldquo;which works has this collector asked
            about&rdquo; and the like. The other reads an inventory file she uploads and turns it
            into structured artwork records.
          </p>
          <p>
            Be clear about what that means: answering a question about a contact sends that
            contact&rsquo;s name and Chloe&rsquo;s notes about them to Anthropic. Our agreement with
            Anthropic prohibits using any of it to train their models.
          </p>
          <p>
            Only signed-in accounts can use these features. Clients never interact with them, and no
            AI feature runs on a public page.
          </p>
        </section>

        <section className="lg-section">
          <h2>Viewing rooms</h2>
          <p>
            The advisor sometimes shares a private link to a <em>viewing room</em> — a page showing
            a selection of works, prepared for one named recipient. These links are unlisted and are
            marked so search engines do not index them.
          </p>
          <p>
            Each link is issued to one named contact, so when you open a room we know it was you.
            We record that the room was opened and which works you scrolled to, and we attach that
            to your contact record. Chloe uses it to know what you responded to, which is what a
            dealer would have noticed had you walked into the room with her.
          </p>
          <p>
            Nothing is stored on your device. No cookie is set, nothing is written to your browser,
            and there is no advertising pixel, no third-party analytics, and no tracking of you
            anywhere else on the web. The record is ours and it stays here. Ask us to stop and we
            will revoke the link, which ends both the access and the recording.
          </p>
        </section>

        <section className="lg-section">
          <h2>What we do not do</h2>
          <ul>
            <li>No advertising, ad networks, or retargeting</li>
            <li>No third-party analytics and no tracking pixels</li>
            <li>No selling, renting, or sharing personal information</li>
            <li>No automated decisions that have a legal effect on anyone</li>
            <li>No training of AI models on your information</li>
          </ul>
          <p>
            One thing we do that belongs on this list rather than off it: we note which works a
            named contact looked at in a viewing room, and we use it to judge what to show them
            next. It is a human reading a signal, not a machine deciding anything. It is described
            in full above, and we would rather write it down here than let you find it out later.
          </p>
        </section>

        <section className="lg-section">
          <h2>Cookies</h2>
          <p>
            One, and only for the people who sign in: our authentication provider sets a session
            cookie so a signed-in user stays signed in. The public pages set no cookies at all.
            That includes viewing rooms — open one and nothing is written to your browser.
          </p>
        </section>

        <section className="lg-section">
          <h2>How long we keep things</h2>
          <p>
            Art records outlast their transactions — a work Chloe placed in 2019 still matters when
            it comes back to market — so contacts, artworks, and provenance notes are kept
            indefinitely unless you ask us to delete them. Invoices we keep for seven years, which
            is longer than the IRS baseline of three and is the practice our accountant asks for.
            Viewing-room activity is kept while the room exists and goes when the room does.
          </p>
        </section>

        <section className="lg-section">
          <h2>Security</h2>
          <p>
            Signing in goes through Google. Records sit in a database with row-level security tied
            to the signed-in account, so a request without a valid session returns nothing at all.
            Traffic is encrypted in transit.
          </p>
          <p>
            If there is a breach that reaches your information, we will tell you and the Texas
            Attorney General as Texas law requires, and we won&rsquo;t sit on it while we decide
            whether it counts.
          </p>
        </section>

        <section className="lg-section">
          <h2>Where your information is held</h2>
          <p>
            All seven providers above are United States companies, and we hold and work with your
            information in the United States. Some of them serve pages from data centers closer to
            wherever you happen to be, which is how the web works and is not somewhere your records
            are stored.
          </p>
        </section>

        <section className="lg-section">
          <h2>Asking us to show, correct, or delete something</h2>
          <p>
            Write to{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . Ask what we hold about you, ask for a copy, have it corrected, have it deleted, or ask
            to stop receiving email. We&rsquo;ll answer as quickly as we can and always within the
            time the law allows us. Two limits, both honest: we may need to confirm you&rsquo;re
            who you say you are before we hand over a file, and we keep completed invoices because
            tax law says we must.
          </p>
          <p>
            Some of you have these rights by statute. The rest of you can ask anyway — that&rsquo;s
            how we prefer to work, though it&rsquo;s a practice rather than a promise, and
            we&rsquo;d rather say so than pretend otherwise. Nobody gets treated differently for
            asking.
          </p>
        </section>

        <section className="lg-section">
          <h2>Children</h2>
          <p>
            This is a tool for a business. It is not directed at children, and we do not knowingly
            hold information about anyone under 16.
          </p>
        </section>

        <section className="lg-section">
          <h2>Changes to this page</h2>
          <p>
            If this policy changes, the date at the top changes with it. That date is set by hand
            and does not move when the application is updated for unrelated reasons. If a change
            materially affects contacts whose information we hold, we will email them.
          </p>
        </section>

        <section className="lg-section">
          <h2>Contact</h2>
          <p>
            {GALLERY_NAME}, a Texas business. Write to{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            and Chloe reads it. The companion page is our{" "}
            <Link className="lg-link" href="/terms">
              terms of use
            </Link>
            .
          </p>
        </section>
      </div>
    </>
  );
}
