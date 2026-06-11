# AI bank-statement reader

Premium feature that reads bank/e-wallet statements Kura's deterministic parser
can't handle, using Claude — and then **teaches Kura the format** so future
statements of it read with no AI, for **every** user.

## How it flows (PDF)

1. User picks an account and uploads a PDF/CSV (`BankStatement.jsx`).
2. **Known format?** On upload, `loadPdf` computes a bank **fingerprint**
   (`statementFingerprint`, which strips account numbers/dates so it matches any
   period) and looks for a saved column layout:
   - local first (`loadPdfMap`, localStorage `kura.pdfmap.v2.<fp>`),
   - then the **shared store** (`getSharedLayout(fp)` → `public.statement_layouts`).
   A hit is read deterministically by `parsePdfStatement` — **no AI**. A shared
   hit is cached locally too.
3. **Unknown / reads wrong?** The user taps **Read with AI** (auto-runs when the
   parser finds 0 rows + consent given). The client sends the extracted statement
   **text** (PDF lines flattened, or CSV raw text) + currency to the edge function.
4. The edge function asks Claude for structured transactions and returns them +
   the statement's own printed totals (`summary`).
5. The client shows a **reconciliation** check: AI rows' money-in/out vs the
   statement's printed totals → "adds up ✓" / "doesn't match ⚠️" / "no totals".
6. **Learning:** only when it reconciles ✓, `learnPdfLayout` derives the column
   layout (date/debit/credit x-positions) from the AI rows, **re-parses to verify
   the totals match**, then saves it to local **and** the shared store
   (`saveSharedLayout`). Review screen shows "🧠 Kura learned this layout".
7. Manual "Teach Kura" mode was **removed** — AI replaces it.

"Read with AI" / teach options are hidden when a read reconciles ✓ (just preview).
First-run "How it works" modal (localStorage `kura.statementIntro.v1`), reopenable
via the header "?" button.

## Pieces

| Piece | Where |
|---|---|
| Edge function | `supabase/functions/parse-statement-ai/index.ts` — Deno; `verify_jwt=false` (auth + Premium checked in-function); model **`claude-sonnet-4-6`**, `temperature: 0`, structured outputs. |
| Anthropic key | Supabase **secret** `ANTHROPIC_API_KEY` on the project (never in repo/app). |
| Layout learner | `src/lib/learnLayout.js` — derives + verifies a `parsePdfStatement` layout from AI rows. |
| Shared store | table `public.statement_layouts` (migration `supabase/migrations/20260610090000_statement_layouts.sql`); RLS: SELECT all authenticated, INSERT/UPDATE Premium only. Holds **no financial data** — only column positions, keyed by fingerprint. |
| Data access | `getSharedLayout` / `saveSharedLayout` in `src/lib/data.js`. |
| Client flow | `src/pages/BankStatement.jsx` (`readWithAI`, `loadPdf`, `computeAiRecon`, intro modal). |
| Privacy copy | `src/lib/legalContent.js` (Anthropic sub-processor + AI disclosure). |

## Privacy

Only the statement **text** is sent (never the file, name, or account details),
only on explicit consent, never stored or used to train AI. Premium-gated, and
only on statements the parser can't read. Learned layouts are column positions
only — safe to share across users.

## Cost

Sonnet ($3/$15 per 1M in/out). Measured ~$0.007 for a small statement; ~3–4¢
typical, ~10–20¢ for a very large one. Each new bank format costs **at most once**
(then it's learned and shared).

## Redeploying the edge function

```sh
curl -X POST "https://api.supabase.com/v1/projects/<REF>/functions/deploy?slug=parse-statement-ai" \
  -H "Authorization: Bearer <SUPABASE_PAT>" \
  -F 'metadata={"name":"parse-statement-ai","entrypoint_path":"index.ts","verify_jwt":false};type=application/json' \
  -F 'file=@supabase/functions/parse-statement-ai/index.ts;type=application/typescript'
```
(Project ref of "The Moo Projects" Kura: `dsdptauowyxgvdsxzhfx`.)
