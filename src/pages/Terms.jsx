// Public Terms & Conditions. Covers the essentials for launch: a clear
// "not financial advice" disclaimer, accuracy limits of the statement converter,
// subscription terms (currently invite-only / no charge — written so paid plans
// drop in later), as-is warranty disclaimer, liability limitation, and Indonesian
// governing law. Update the effective date when the terms change.

import LegalDoc, { H2, P, UL, LI, Strong, A } from '../components/LegalDoc'

const CONTACT = 'stan.leeansyah@gmail.com'

export default function Terms() {
  return (
    <LegalDoc title="Terms & Conditions" updated="3 June 2026">
      <P>
        These Terms &amp; Conditions (“Terms”) govern your use of Kura, a personal-finance app operated by{' '}
        <Strong>Stanley Leeansyah</Strong> (“we”, “us”, “Kura”). By creating an account or using Kura, you
        agree to these Terms. If you do not agree, please don’t use the app.
      </P>

      <H2>1. What Kura is</H2>
      <P>
        Kura is a tool that helps you record and review your own income, expenses, transfers and account
        balances across multiple accounts and currencies. It is an organisational and informational tool
        only.
      </P>

      <H2>2. Not financial advice</H2>
      <P>
        Kura does <Strong>not</Strong> provide financial, investment, tax, accounting or legal advice.
        Anything Kura shows you — balances, totals, statistics, net worth, converted amounts — is for your
        own information based on the data you entered. You are solely responsible for your financial
        decisions. Always consult a qualified professional before making important financial choices.
      </P>

      <H2>3. Your account</H2>
      <UL>
        <LI>You must be at least 17 years old to use Kura.</LI>
        <LI>You agree to provide accurate information and to keep your password confidential.</LI>
        <LI>You are responsible for activity that happens under your account.</LI>
        <LI>Tell us promptly at <A href={`mailto:${CONTACT}`}>{CONTACT}</A> if you believe your account has been compromised.</LI>
      </UL>

      <H2>4. Acceptable use</H2>
      <P>You agree not to misuse Kura — including attempting to access other users’ data, disrupting the
        service, reverse-engineering it, or using it for any unlawful purpose.</P>

      <H2>5. The data you enter</H2>
      <P>
        The financial data in Kura is yours. You are responsible for its accuracy and for keeping your own
        backups. Kura provides export and backup tools (Settings → Backup &amp; data) — we strongly
        encourage you to use them regularly. We are not responsible for data you delete or for inaccuracies
        in the data you enter.
      </P>

      <H2>6. Bank statement converter</H2>
      <P>
        The premium statement converter reads PDF and CSV statements on your device to pre-fill
        transactions. It is a <Strong>best-effort convenience tool</Strong>: automatic reading can
        misinterpret some layouts, dates or amounts. You must <Strong>review every row before saving</Strong>.
        We are not responsible for errors in converted data — the figures of record are always your own
        bank’s statements.
      </P>

      <H2>7. Premium &amp; subscriptions</H2>
      <P>
        Some features (currently the bank-statement converter) are part of Kura Premium. Premium is{' '}
        <Strong>invite-only at this time and is granted manually at no charge</Strong> while Kura is in its
        early stage. If and when we introduce paid subscriptions, the price, billing cycle, renewal,
        cancellation and refund terms will be shown to you clearly at the point of purchase (for example,
        through the Google Play Store), and those terms — together with the platform’s own rules — will
        apply to that purchase. We may change which features are free or premium over time.
      </P>

      <H2>8. Availability</H2>
      <P>
        We work to keep Kura available and reliable, but we provide it on an “as is” and “as available”
        basis. We may change, suspend or discontinue features, and we don’t guarantee the service will be
        uninterrupted or error-free.
      </P>

      <H2>9. Disclaimer of warranties</H2>
      <P>
        To the fullest extent permitted by law, Kura is provided <Strong>“as is”</Strong> without warranties
        of any kind, whether express or implied, including fitness for a particular purpose and accuracy of
        results.
      </P>

      <H2>10. Limitation of liability</H2>
      <P>
        To the fullest extent permitted by Indonesian law, we will not be liable for any indirect,
        incidental, or consequential damages, or for any loss of data, profits or financial loss arising
        from your use of — or inability to use — Kura, including any decision made based on information
        shown in the app. Nothing in these Terms limits liability that cannot be limited by law.
      </P>

      <H2>11. Ending your use</H2>
      <P>
        You can stop using Kura and delete your account at any time (Settings → Email &amp; password). We
        may suspend or terminate access if these Terms are breached or to comply with the law.
      </P>

      <H2>12. Governing law</H2>
      <P>
        These Terms are governed by the laws of the Republic of Indonesia, and any disputes will be subject
        to the jurisdiction of the Indonesian courts.
      </P>

      <H2>13. Changes to these Terms</H2>
      <P>
        We may update these Terms as Kura evolves. We’ll change the “Last updated” date above and, for
        significant changes, give you notice in the app. Continuing to use Kura after a change means you
        accept the updated Terms.
      </P>

      <H2>14. Contact</H2>
      <P>
        Questions about these Terms? Email <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.
      </P>
    </LegalDoc>
  )
}
