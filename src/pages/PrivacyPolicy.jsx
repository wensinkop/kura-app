// Public Privacy Policy. Written to satisfy the Google Play Store requirement,
// the heightened expectation for a personal-finance app, and Indonesia's UU PDP
// (Law No. 27 of 2022 on Personal Data Protection). Data controller is Stanley
// Leeansyah operating Kura as an individual; contact is the email below.
// Reflects CURRENT reality (no advertising, no data selling, client-side
// statement parsing). Update the effective date when the policy changes.

import LegalDoc, { H2, P, UL, LI, Strong, A } from '../components/LegalDoc'

const CONTACT = 'stan.leeansyah@gmail.com'

export default function PrivacyPolicy() {
  return (
    <LegalDoc title="Privacy Policy" updated="3 June 2026">
      <P>
        Kura is a personal-finance app that helps you track your income, expenses and transfers across
        your accounts. We take your privacy seriously — Kura is built so that your financial data stays
        yours. This policy explains what we collect, how we use it, who processes it, and the rights you
        have over it.
      </P>
      <P>
        Kura is operated by <Strong>Stanley Leeansyah</Strong> as an individual (“we”, “us”, “Kura”),
        who is the data controller responsible for your personal data. You can reach us any time at{' '}
        <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
      </P>

      <H2>Who this applies to</H2>
      <P>
        This policy applies to everyone who uses Kura. Our users are primarily based in Indonesia, so we
        handle personal data in line with Indonesia’s Personal Data Protection Law (Undang-Undang No. 27
        Tahun 2022 tentang Pelindungan Data Pribadi, “UU PDP”). Kura is not intended for children under
        the age of 17.
      </P>

      <H2>What we collect</H2>
      <P>We only collect what Kura needs to work for you:</P>
      <UL>
        <LI><Strong>Account details</Strong> — your email address and a password (the password is never stored in readable form; it is securely hashed by our authentication provider).</LI>
        <LI><Strong>Profile</Strong> — your name, your chosen base currency, and your plan (free or premium).</LI>
        <LI><Strong>Financial data you enter</Strong> — the accounts you create (names, opening balances), your transactions (amounts, dates, types, notes), categories, transfers and exchange rates. This is the information you choose to record in Kura.</LI>
        <LI><Strong>Bank-statement files (Premium)</Strong> — see “Bank statement converter” below. The file itself is processed entirely on your own device and is never uploaded to us.</LI>
        <LI><Strong>Basic technical data</Strong> — like any web service, our hosting providers automatically receive standard request information (such as IP address and browser type) to deliver and secure the service.</LI>
      </UL>
      <P>
        We do <Strong>not</Strong> connect to your bank, and we never ask for your online-banking login,
        card numbers or one-time passwords.
      </P>

      <H2>How we use your data</H2>
      <UL>
        <LI>To provide the app — store and display your accounts, transactions and reports.</LI>
        <LI>To sign you in and keep your account secure.</LI>
        <LI>To operate premium features for accounts that have them.</LI>
        <LI>To respond to you when you contact support.</LI>
      </UL>
      <P>
        We do <Strong>not</Strong> sell your personal data, and we do <Strong>not</Strong> use it for
        advertising. We do not show ads in Kura today; if that ever changes, we will update this policy
        and tell you before it takes effect.
      </P>

      <H2>The legal basis for processing</H2>
      <P>
        We process your data to perform the service you have signed up for (our contract with you) and,
        where required by UU PDP, on the basis of your consent, which you give by creating an account and
        entering your data. You can withdraw consent at any time by deleting your account.
      </P>

      <H2>Bank statement converter (Premium)</H2>
      <P>
        Kura’s premium statement converter turns a PDF or CSV bank statement into rows you can review and
        save. This happens <Strong>entirely inside your browser, on your device</Strong> — the statement
        file is read locally and is never sent to or stored on our servers. If a statement is password
        protected, the password is used only on your device to open the file and is not transmitted or
        kept. Only the transactions you choose to save are added to your account. Any layout Kura
        “learns” to read your bank’s format is stored locally on your device, not on our servers.
      </P>

      <H2>Who processes your data (sub-processors)</H2>
      <P>To run Kura we rely on a small number of trusted infrastructure providers:</P>
      <UL>
        <LI><Strong>Supabase</Strong> — provides our database and authentication. Your account and financial data are stored here. Supabase hosts this data on Amazon Web Services in the <Strong>Singapore (ap-southeast-1)</Strong> region.</LI>
        <LI><Strong>Netlify</Strong> — hosts and delivers the Kura web app to your browser.</LI>
      </UL>

      <H2>International data transfer</H2>
      <P>
        Because our database is hosted in Singapore, your personal data is stored and processed{' '}
        <Strong>outside Indonesia</Strong>. By using Kura you acknowledge this transfer. We only use
        providers that apply recognised security and data-protection safeguards.
      </P>

      <H2>How long we keep it</H2>
      <P>
        We keep your data for as long as your account exists. When you delete your account, your data —
        accounts, transactions, categories and settings — is permanently removed, and your authentication
        record is deleted. This cannot be undone, so consider exporting a backup first.
      </P>

      <H2>How we protect it</H2>
      <UL>
        <LI>All traffic is encrypted in transit (HTTPS).</LI>
        <LI>Database access is protected by row-level security, so each account can only ever read or change its own data.</LI>
        <LI>Passwords are stored only as secure hashes.</LI>
      </UL>
      <P>
        No method of storage or transmission is ever 100% secure, but we take reasonable, industry-standard
        measures to protect your information.
      </P>

      <H2>Your rights</H2>
      <P>Under UU PDP and as a matter of good practice, you can:</P>
      <UL>
        <LI><Strong>Access</Strong> your data — it is all visible inside the app.</LI>
        <LI><Strong>Correct</Strong> it — edit your profile, accounts and transactions at any time.</LI>
        <LI><Strong>Export</Strong> it — download a full backup or CSV from Settings → Backup &amp; data (data portability).</LI>
        <LI><Strong>Delete</Strong> it — erase your account and all data from Settings → Email &amp; password.</LI>
        <LI><Strong>Withdraw consent</Strong> or object to processing — by deleting your account.</LI>
        <LI><Strong>Complain</Strong> — you may lodge a complaint with the relevant Indonesian data-protection authority.</LI>
      </UL>
      <P>
        To exercise any right that you can’t complete in the app, email us at{' '}
        <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        We may update this policy as Kura evolves. When we do, we’ll change the “Last updated” date above,
        and for significant changes we’ll give you notice in the app.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about your privacy or this policy? Email{' '}
        <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
      </P>
    </LegalDoc>
  )
}
