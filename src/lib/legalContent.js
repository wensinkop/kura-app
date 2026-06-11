// Default (bundled) content for the owner-editable pages, authored in the small
// Markdown subset that lib/markdown.jsx understands. These are the single source
// of truth until an admin saves an override in the `documents` table — the pages
// fall back to these if no row exists, and the admin editor seeds from them.
//
// `kind` selects the renderer: 'prose' (Privacy/Terms) or 'faq' (## section,
// ### question). Edit the text below to change the shipped defaults.

const CONTACT = 'stan.leeansyah@gmail.com'

const PRIVACY_MD = `Smara is a personal-finance app that helps you track your income, expenses and transfers across your accounts. We take your privacy seriously — Smara is built so that your financial data stays yours. This policy explains what we collect, how we use it, who processes it, and the rights you have over it.

Smara is operated by **Stanley Leeansyah** as an individual (“we”, “us”, “Smara”), who is the data controller responsible for your personal data. You can reach us any time at [${CONTACT}](mailto:${CONTACT}).

## Who this applies to
This policy applies to everyone who uses Smara. Our users are primarily based in Indonesia, so we handle personal data in line with Indonesia’s Personal Data Protection Law (Undang-Undang No. 27 Tahun 2022 tentang Pelindungan Data Pribadi, “UU PDP”). Smara is not intended for children under the age of 17.

## What we collect
We only collect what Smara needs to work for you:

- **Account details** — your email address and a password (the password is never stored in readable form; it is securely hashed by our authentication provider).
- **Profile** — your name, your chosen base currency, and your plan (free or premium).
- **Financial data you enter** — the accounts you create (names, opening balances), your transactions (amounts, dates, types, notes), categories, transfers and exchange rates. This is the information you choose to record in Smara.
- **Bank-statement files (Premium)** — see “Bank statement converter” below. The file is read on your own device and is never uploaded to us; only if you opt in to AI reading is the statement’s text sent to our AI provider to read it.
- **Basic technical data** — like any web service, our hosting providers automatically receive standard request information (such as IP address and browser type) to deliver and secure the service.

We do **not** connect to your bank, and we never ask for your online-banking login, card numbers or one-time passwords.

## How we use your data
- To provide the app — store and display your accounts, transactions and reports.
- To sign you in and keep your account secure.
- To operate premium features for accounts that have them.
- To respond to you when you contact support.

We do **not** sell your personal data, and we do **not** use it for advertising. We do not show ads in Smara today; if that ever changes, we will update this policy and tell you before it takes effect.

## The legal basis for processing
We process your data to perform the service you have signed up for (our contract with you) and, where required by UU PDP, on the basis of your consent, which you give by creating an account and entering your data. You can withdraw consent at any time by deleting your account.

## Bank statement converter (Premium)
Smara’s premium statement converter turns a PDF or CSV bank statement into rows you can review and save. By default this happens **entirely inside your browser, on your device** — the statement file is read locally and is never sent to or stored on our servers. If a statement is password protected, the password is used only on your device to open the file and is not transmitted or kept. Any layout Smara “learns” to read your bank’s format is stored locally on your device, not on our servers.

**AI reading (optional).** If Smara can’t read a statement automatically — or you ask it to — you can choose to have it read by AI. Only then, and only after you agree, is the **text of that statement** sent securely to our AI provider (Anthropic) to pull out the transactions. We ask for your consent the first time and remember your choice on that device. The statement text is used only to read that one statement; it is not used to train any AI model and is not retained for training. We never send the original file, your name, or your account details — only the statement text needed to read it. You can avoid this entirely by using Smara’s manual “teach” mode instead. Either way, only the transactions you choose to save are added to your account.

## Who processes your data (sub-processors)
To run Smara we rely on a small number of trusted infrastructure providers:

- **Supabase** — provides our database and authentication. Your account and financial data are stored here. Supabase hosts this data on Amazon Web Services in the **Singapore (ap-southeast-1)** region.
- **Netlify** — hosts and delivers the Smara web app to your browser.
- **Anthropic** — provides the AI model behind the optional AI statement reader (above). It receives the statement’s text **only** when you choose AI reading, processes it to return the transactions, and does not use it to train its models.

## International data transfer
Because our database is hosted in Singapore, your personal data is stored and processed **outside Indonesia**. By using Smara you acknowledge this transfer. We only use providers that apply recognised security and data-protection safeguards.

## How long we keep it
We keep your data for as long as your account exists. When you delete your account, your data — accounts, transactions, categories and settings — is permanently removed, and your authentication record is deleted. This cannot be undone, so consider exporting a backup first.

## How we protect it
- All traffic is encrypted in transit (HTTPS).
- Database access is protected by row-level security, so each account can only ever read or change its own data.
- Passwords are stored only as secure hashes.

No method of storage or transmission is ever 100% secure, but we take reasonable, industry-standard measures to protect your information.

## Your rights
Under UU PDP and as a matter of good practice, you can:

- **Access** your data — it is all visible inside the app.
- **Correct** it — edit your profile, accounts and transactions at any time.
- **Export** it — download a full backup or CSV from Settings → Backup & data (data portability).
- **Delete** it — erase your account and all data from Settings → Email & password.
- **Withdraw consent** or object to processing — by deleting your account.
- **Complain** — you may lodge a complaint with the relevant Indonesian data-protection authority.

To exercise any right that you can’t complete in the app, email us at [${CONTACT}](mailto:${CONTACT}).

## Changes to this policy
We may update this policy as Smara evolves. When we do, we’ll change the “Last updated” date above, and for significant changes we’ll give you notice in the app.

## Contact
Questions about your privacy or this policy? Email [${CONTACT}](mailto:${CONTACT}).`

const TERMS_MD = `These Terms & Conditions (“Terms”) govern your use of Smara, a personal-finance app operated by **Stanley Leeansyah** (“we”, “us”, “Smara”). By creating an account or using Smara, you agree to these Terms. If you do not agree, please don’t use the app.

## 1. What Smara is
Smara is a tool that helps you record and review your own income, expenses, transfers and account balances across multiple accounts and currencies. It is an organisational and informational tool only.

## 2. Not financial advice
Smara does **not** provide financial, investment, tax, accounting or legal advice. Anything Smara shows you — balances, totals, statistics, net worth, converted amounts — is for your own information based on the data you entered. You are solely responsible for your financial decisions. Always consult a qualified professional before making important financial choices.

## 3. Your account
- You must be at least 17 years old to use Smara.
- You agree to provide accurate information and to keep your password confidential.
- You are responsible for activity that happens under your account.
- Tell us promptly at [${CONTACT}](mailto:${CONTACT}) if you believe your account has been compromised.

## 4. Acceptable use
You agree not to misuse Smara — including attempting to access other users’ data, disrupting the service, reverse-engineering it, or using it for any unlawful purpose.

## 5. The data you enter
The financial data in Smara is yours. You are responsible for its accuracy and for keeping your own backups. Smara provides export and backup tools (Settings → Backup & data) — we strongly encourage you to use them regularly. We are not responsible for data you delete or for inaccuracies in the data you enter.

## 6. Bank statement converter
The premium statement converter reads PDF and CSV statements on your device to pre-fill transactions. It is a **best-effort convenience tool**: automatic reading can misinterpret some layouts, dates or amounts. You must **review every row before saving**. We are not responsible for errors in converted data — the figures of record are always your own bank’s statements.

## 7. Premium & subscriptions
Some features (currently the bank-statement converter) are part of Smara Premium. Premium is **invite-only at this time and is granted manually at no charge** while Smara is in its early stage. If and when we introduce paid subscriptions, the price, billing cycle, renewal, cancellation and refund terms will be shown to you clearly at the point of purchase (for example, through the Google Play Store), and those terms — together with the platform’s own rules — will apply to that purchase. We may change which features are free or premium over time.

## 8. Availability
We work to keep Smara available and reliable, but we provide it on an “as is” and “as available” basis. We may change, suspend or discontinue features, and we don’t guarantee the service will be uninterrupted or error-free.

## 9. Disclaimer of warranties
To the fullest extent permitted by law, Smara is provided **“as is”** without warranties of any kind, whether express or implied, including fitness for a particular purpose and accuracy of results.

## 10. Limitation of liability
To the fullest extent permitted by Indonesian law, we will not be liable for any indirect, incidental, or consequential damages, or for any loss of data, profits or financial loss arising from your use of — or inability to use — Smara, including any decision made based on information shown in the app. Nothing in these Terms limits liability that cannot be limited by law.

## 11. Ending your use
You can stop using Smara and delete your account at any time (Settings → Email & password). We may suspend or terminate access if these Terms are breached or to comply with the law.

## 12. Governing law
These Terms are governed by the laws of the Republic of Indonesia, and any disputes will be subject to the jurisdiction of the Indonesian courts.

## 13. Changes to these Terms
We may update these Terms as Smara evolves. We’ll change the “Last updated” date above and, for significant changes, give you notice in the app. Continuing to use Smara after a change means you accept the updated Terms.

## 14. Contact
Questions about these Terms? Email [${CONTACT}](mailto:${CONTACT}).`

const HELP_MD = `Quick answers to common questions. Can’t find what you need? Email [${CONTACT}](mailto:${CONTACT}) and we’ll help.

## Getting started
### What is Smara?
Smara is a personal-finance app for tracking your income, expenses and transfers across all of your accounts and currencies — so you always know where your money is and where it’s going.

### Does Smara connect to my bank?
No. Smara never connects to your bank and never asks for your online-banking login. You add transactions yourself, or use the premium statement converter to turn a statement file you already have into ready-to-review rows.

### Is my financial data private?
Yes. Your data is protected so only your account can read it, traffic is encrypted, and we never sell your data or use it for ads. See our [Privacy Policy](/legal/privacy) for the full picture.

### Can I install Smara like an app?
Yes — Smara is a progressive web app. In your phone browser, choose “Add to Home Screen” (or “Install app”). It then opens full-screen like a normal app.

## Accounts & transactions
### How do I add an account or a transaction?
Create accounts in Settings → Accounts & groups. To add a transaction, tap the “＋” button and choose Income, Expense or Transfer.

### How do transfers work?
A transfer moves money between two of your own accounts — money out of one and into the other, with no effect on your overall net worth. If the two accounts use different currencies, you can set the amount received and the exchange rate.

### How does multi-currency and net worth work?
Each account has its own currency. To combine everything into one figure, Smara converts foreign balances into your base currency using the exchange rates you set in Settings → Exchange rates. Set your base currency in Settings → Preferences.

### Why are some numbers coloured and balances aren’t?
Colour shows direction of money flow — income and expense amounts are coloured — while balances are shown neutrally, because a balance is just a position, not a gain or loss.

### How do credit-card billing cycles show up?
For a credit-card account, the account view groups transactions by billing cycle based on its settlement day, so you can see each statement period and step between cycles.

### Can I change a transaction’s type after saving it?
Yes. Open the transaction and use the Type picker to switch between income, expense and transfer; the fields adapt automatically.

## Bank statement converter (Premium)
### What does the statement converter do?
It reads a PDF or CSV bank statement and turns it into pre-filled transactions you can review and save — so you don’t have to type each one. Find it in Settings → Bank statement upload.

### Is my statement uploaded anywhere?
No. The file is read entirely on your own device, inside your browser. It is never uploaded to our servers. Only the rows you choose to save become transactions.

### Does it support password-protected and multi-currency statements?
Yes. If a PDF needs a password, you enter it on your device to open the file. For multi-currency statements, Smara focuses on the currency of the account you’re importing into.

### It didn’t read my bank’s format. What now?
If automatic reading finds nothing, Smara switches to a quick “teach” mode: you tap the date and amount on one row, and Smara learns your bank’s layout and remembers it on your device for next time. Scanned or image-only PDFs aren’t supported — use the CSV export from your bank instead.

## Premium
### What’s included in Premium?
Premium currently unlocks the bank-statement converter. Everything else in Smara is free.

### How do I get Premium?
Premium is invite-only right now and granted manually at no charge while Smara is in its early stage. Open the bank-statement feature and tap “Request access”, or email [${CONTACT}](mailto:${CONTACT}).

## Backups, data & your account
### How do I back up or export my data?
Go to Settings → Backup & data. You can export to CSV or download a full backup file, and restore from a backup later. We recommend taking a backup regularly.

### How do I change my email or password?
Settings → Email & password. Changing your email sends a confirmation link to the new address; the change takes effect once you click it.

### I forgot my password.
On the sign-in screen, tap “Forgot password” and follow the emailed link to set a new one.

### How do I delete my account?
Settings → Email & password → Delete account. This permanently removes your account and all your data and cannot be undone — download a backup first if you might want your data later.

## Troubleshooting
### Smara still looks like the old version after an update.
If you’ve installed Smara to your home screen, fully close it and reopen it once after an update so it loads the newest version. A normal browser refresh also works.

### Something looks wrong or I found a bug.
Sorry about that — email [${CONTACT}](mailto:${CONTACT}) with what happened and we’ll look into it.`

// Slug → metadata + default body. Order is the order shown in the admin editor.
export const DOCS = {
  privacy: { slug: 'privacy', title: 'Privacy Policy', updated: '10 June 2026', kind: 'prose', body: PRIVACY_MD },
  terms:   { slug: 'terms',   title: 'Terms & Conditions', updated: '3 June 2026', kind: 'prose', body: TERMS_MD },
  help:    { slug: 'help',    title: 'Help & FAQ', updated: null, kind: 'faq', body: HELP_MD },
}

export const DOC_LIST = [DOCS.privacy, DOCS.terms, DOCS.help]
