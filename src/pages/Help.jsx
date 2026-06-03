// Public Help & FAQ. One page for now, grouped into sections of collapsible
// questions (native <details> — no state, accessible, works signed-out). Written
// to answer the real questions a new Kura user asks. Grows over time; keep
// answers accurate to shipped behaviour.

import LegalDoc, { A } from '../components/LegalDoc'
import { ChevronDown } from '../lib/icons'

const CONTACT = 'stan.leeansyah@gmail.com'

function Section({ title, children }) {
  return (
    <div className="mt-7 first:mt-2">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint mb-2 px-1">{title}</h2>
      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">{children}</div>
    </div>
  )
}

function QA({ q, children }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-surface-2">
        <span className="flex-1 font-semibold text-[14.5px] text-text">{q}</span>
        <ChevronDown className="w-[18px] h-[18px] text-faint transition-transform group-open:rotate-180 shrink-0" />
      </summary>
      <div className="px-4 pb-4 -mt-0.5 text-[14px] text-muted leading-relaxed space-y-2">{children}</div>
    </details>
  )
}

export default function Help() {
  return (
    <LegalDoc title="Help & FAQ">
      <p className="text-[14.5px] text-muted leading-relaxed mb-2">
        Quick answers to common questions. Can’t find what you need? Email{' '}
        <A href={`mailto:${CONTACT}`}>{CONTACT}</A> and we’ll help.
      </p>

      <Section title="Getting started">
        <QA q="What is Kura?">
          <p>Kura is a personal-finance app for tracking your income, expenses and transfers across all of
            your accounts and currencies — so you always know where your money is and where it’s going.</p>
        </QA>
        <QA q="Does Kura connect to my bank?">
          <p>No. Kura never connects to your bank and never asks for your online-banking login. You add
            transactions yourself, or use the premium statement converter to turn a statement file you
            already have into ready-to-review rows.</p>
        </QA>
        <QA q="Is my financial data private?">
          <p>Yes. Your data is protected so only your account can read it, traffic is encrypted, and we
            never sell your data or use it for ads. See our <A href="/legal/privacy">Privacy Policy</A> for
            the full picture.</p>
        </QA>
        <QA q="Can I install Kura like an app?">
          <p>Yes — Kura is a progressive web app. In your phone browser, choose “Add to Home Screen” (or
            “Install app”). It then opens full-screen like a normal app.</p>
        </QA>
      </Section>

      <Section title="Accounts & transactions">
        <QA q="How do I add an account or a transaction?">
          <p>Create accounts in Settings → Accounts &amp; groups. To add a transaction, tap the “＋” button
            and choose Income, Expense or Transfer.</p>
        </QA>
        <QA q="How do transfers work?">
          <p>A transfer moves money between two of your own accounts — money out of one and into the other,
            with no effect on your overall net worth. If the two accounts use different currencies, you can
            set the amount received and the exchange rate.</p>
        </QA>
        <QA q="How does multi-currency and net worth work?">
          <p>Each account has its own currency. To combine everything into one figure, Kura converts foreign
            balances into your base currency using the exchange rates you set in Settings → Exchange rates.
            Set your base currency in Settings → Preferences.</p>
        </QA>
        <QA q="Why are some numbers coloured and balances aren’t?">
          <p>Colour shows direction of money flow — income and expense amounts are coloured — while balances
            are shown neutrally, because a balance is just a position, not a gain or loss.</p>
        </QA>
        <QA q="How do credit-card billing cycles show up?">
          <p>For a credit-card account, the account view groups transactions by billing cycle based on its
            settlement day, so you can see each statement period and step between cycles.</p>
        </QA>
        <QA q="Can I change a transaction’s type after saving it?">
          <p>Yes. Open the transaction and use the Type picker to switch between income, expense and
            transfer; the fields adapt automatically.</p>
        </QA>
      </Section>

      <Section title="Bank statement converter (Premium)">
        <QA q="What does the statement converter do?">
          <p>It reads a PDF or CSV bank statement and turns it into pre-filled transactions you can review
            and save — so you don’t have to type each one. Find it in Settings → Bank statement upload.</p>
        </QA>
        <QA q="Is my statement uploaded anywhere?">
          <p>No. The file is read entirely on your own device, inside your browser. It is never uploaded to
            our servers. Only the rows you choose to save become transactions.</p>
        </QA>
        <QA q="Does it support password-protected and multi-currency statements?">
          <p>Yes. If a PDF needs a password, you enter it on your device to open the file. For
            multi-currency statements, Kura focuses on the currency of the account you’re importing into.</p>
        </QA>
        <QA q="It didn’t read my bank’s format. What now?">
          <p>If automatic reading finds nothing, Kura switches to a quick “teach” mode: you tap the date and
            amount on one row, and Kura learns your bank’s layout and remembers it on your device for next
            time. Scanned or image-only PDFs aren’t supported — use the CSV export from your bank instead.</p>
        </QA>
      </Section>

      <Section title="Premium">
        <QA q="What’s included in Premium?">
          <p>Premium currently unlocks the bank-statement converter. Everything else in Kura is free.</p>
        </QA>
        <QA q="How do I get Premium?">
          <p>Premium is invite-only right now and granted manually at no charge while Kura is in its early
            stage. Open the bank-statement feature and tap “Request access”, or email{' '}
            <A href={`mailto:${CONTACT}`}>{CONTACT}</A>.</p>
        </QA>
      </Section>

      <Section title="Backups, data & your account">
        <QA q="How do I back up or export my data?">
          <p>Go to Settings → Backup &amp; data. You can export to CSV or download a full backup file, and
            restore from a backup later. We recommend taking a backup regularly.</p>
        </QA>
        <QA q="How do I change my email or password?">
          <p>Settings → Email &amp; password. Changing your email sends a confirmation link to the new
            address; the change takes effect once you click it.</p>
        </QA>
        <QA q="I forgot my password.">
          <p>On the sign-in screen, tap “Forgot password” and follow the emailed link to set a new one.</p>
        </QA>
        <QA q="How do I delete my account?">
          <p>Settings → Email &amp; password → Delete account. This permanently removes your account and all
            your data and cannot be undone — download a backup first if you might want your data later.</p>
        </QA>
      </Section>

      <Section title="Troubleshooting">
        <QA q="Kura still looks like the old version after an update.">
          <p>If you’ve installed Kura to your home screen, fully close it and reopen it once after an update
            so it loads the newest version. A normal browser refresh also works.</p>
        </QA>
        <QA q="Something looks wrong or I found a bug.">
          <p>Sorry about that — email <A href={`mailto:${CONTACT}`}>{CONTACT}</A> with what happened and
            we’ll look into it.</p>
        </QA>
      </Section>
    </LegalDoc>
  )
}
