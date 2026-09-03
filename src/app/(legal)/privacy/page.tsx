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
        standfirst={`${GALLERY_NAME} is an art advisory. It runs a private application to manage its own records — works, contacts, and invoices. This page says plainly what that application holds, who else touches it, and how to ask us to change or delete something.`}
      />

      <div className="lg-body">
        <section className="lg-section">
          <h2>What this application is</h2>
          <p>
            It is an internal tool for one art advisor. Two people have accounts. There is no public
            sign-up, no client log-ins, no advertising, and no marketplace. We do not sell, rent, or
            share information for anyone else&rsquo;s marketing.
          </p>
        </section>

        <section className="lg-section">
          <h2>Whose information is in it</h2>
          <p>Two groups of people.</p>
          <ul>
            <li>
              <strong>The two people who sign in.</strong> Their name, email address, and the Google
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
            If your details are in here, it is because you are one of the advisory&rsquo;s contacts.
            We did not buy your information from anyone, and no one outside the two accounts above
            can read it.
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
            Each of these is a vendor we pay to provide part of the service. None of them is
            permitted to use the advisory&rsquo;s information for their own purposes.
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
            into structured artwork records. Both send the relevant text to Anthropic and receive
            text back.
          </p>
          <p>
            Only the two signed-in accounts can use these features. Clients never interact with
            them, and no AI feature runs on a public page. Under Anthropic&rsquo;s commercial terms,
            content sent through their API is not used to train their models.
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
            When a recipient opens the link, the application records that the room was opened and
            which works were viewed, and attributes that to the contact the link was issued to. This
            is first-party record-keeping so the advisor knows what a client responded to. There are
            no advertising pixels, no third-party analytics, and no cross-site tracking anywhere in
            the application. A link can be revoked at any time, which stops both access and
            recording.
          </p>
        </section>

        <section className="lg-section">
          <h2>What we do not do</h2>
          <ul>
            <li>No advertising, ad networks, or retargeting</li>
            <li>No third-party analytics and no tracking pixels</li>
            <li>No selling, renting, or sharing information for marketing</li>
            <li>No profiling and no automated decisions that have a legal effect on anyone</li>
            <li>No training of AI models on your information</li>
          </ul>
        </section>

        <section className="lg-section">
          <h2>Cookies</h2>
          <p>
            Only the ones the application needs to work. Our authentication provider sets a session
            cookie so a signed-in user stays signed in. Public pages — this one, the terms page, and
            viewing rooms — set no analytics or advertising cookies.
          </p>
        </section>

        <section className="lg-section">
          <h2>How long we keep things</h2>
          <p>
            Business records — works, contacts, invoices — are kept for as long as the advisory
            needs them, and invoices for as long as tax and accounting rules require, generally at
            least seven years. Viewing-room activity is kept for as long as the room exists.
            Anything else is deleted once it is no longer useful.
          </p>
        </section>

        <section className="lg-section">
          <h2>Security</h2>
          <p>
            Getting in requires signing in through Google. Records are held in a database with
            row-level security tied to the signed-in account, so a request without a valid session
            returns nothing. Traffic is encrypted in transit. No system is perfect; if something
            goes wrong in a way that affects you, we will tell you.
          </p>
        </section>

        <section className="lg-section">
          <h2>Where your information is held</h2>
          <p>
            The advisory operates in the United States, and the service providers listed above store
            and process information there. If you are outside the United States and give us your
            details, they are transferred to and held in the United States.
          </p>
        </section>

        <section className="lg-section">
          <h2>Asking us to show, correct, or delete something</h2>
          <p>
            Write to{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>{" "}
            and ask what we hold about you, ask for a copy, have it corrected, have it deleted, or
            ask to stop receiving email. We answer within 30 days. The one limit on deletion is
            records we are legally required to keep, mainly completed invoices.
          </p>
          <p>
            Where you live may already give you these rights — California, the European Union, and
            the United Kingdom all do. We extend them to everyone, so you do not need to cite a
            statute to ask. We will not treat you differently for asking.
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
            {GALLERY_NAME} —{" "}
            <a className="lg-link" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . The companion page is our{" "}
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
