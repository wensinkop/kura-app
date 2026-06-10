// Kura — AI bank-statement reader (Premium).
//
// Takes the raw text the client already extracted from a PDF/CSV statement and
// asks Claude (Haiku) to return a clean list of transactions. Used only as a
// fallback when Kura's deterministic parser can't read a statement, or when the
// user taps "Read with AI". Runs server-side so the Anthropic API key never
// reaches the app.
//
// Deployed with verify_jwt = false: we do auth + the Premium check in-function so
// the browser CORS preflight (which carries no Authorization header) isn't
// rejected by the gateway.
//
// Secrets (Project settings -> Edge Functions): ANTHROPIC_API_KEY.
// SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

const SYSTEM = `You convert raw bank- or e-wallet-statement text into a clean list of transactions for a personal-finance app.

Rules:
- Output ONLY actual money movements. Ignore page headers, column titles, opening/closing/running balances, subtotal/total rows, page numbers, and marketing text.
- date: transaction date as YYYY-MM-DD. If the year is missing, infer it from nearby context. If the day/month order is ambiguous (e.g. 03/04/2026), assume DAY first (DD/MM/YYYY) — these statements are usually Indonesian / Southeast-Asian.
- amount: the value as a POSITIVE number, no currency symbol, no thousands separators (e.g. 1234567.89). Never negative. Never use the running Balance/Saldo column as the amount.
- kind: "expense" = money leaving the account; "income" = money coming in.
- DEBIT/CREDIT COLUMNS ARE AUTHORITATIVE. If the statement has separate columns for money out and money in (e.g. Debet/Kredit, Debit/Credit, Withdrawal/Deposit, Mutasi DB/CR), the column an amount sits in decides the kind: a value in the debit/withdrawal column is ALWAYS "expense"; a value in the credit/deposit column is ALWAYS "income" — even when the description suggests otherwise (e.g. "PNMPTN DEP", "DEPOSIT", "SETORAN", "TRANSFER" sitting in the debit column is still an expense). For each row, take the single non-zero value of the debit/credit pair as the amount and ignore the zero.
- Only when there are NO separate debit/credit columns, fall back to a +/- sign, a CR/DB or K/D marker, or description keywords to decide the kind.
- description: a short human label (merchant or memo) from the statement. Trim obvious reference numbers and noise but keep it recognizable.
- Preserve the order the transactions appear. Do not invent, merge, or split rows. If a value is unreadable, omit that row rather than guessing.
- summary: ONLY if the statement prints its own totals, copy them as numbers (no separators): total_out (total debit / money out), total_in (total credit / money in), opening_balance (saldo awal), closing_balance (saldo akhir). Use null for any the statement does not state. Do NOT calculate these from the rows yourself — only copy figures the statement actually prints.
The account currency is given for context only — never convert amounts.`

const NULLABLE_NUMBER = { anyOf: [{ type: 'number' }, { type: 'null' }] }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transactions', 'summary'],
  properties: {
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'amount', 'kind', 'description'],
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          amount: { type: 'number', description: 'absolute value, positive' },
          kind: { type: 'string', enum: ['income', 'expense'] },
          description: { type: 'string' },
        },
      },
    },
    // Totals the statement prints about itself (for a sanity check) — null when absent.
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['total_in', 'total_out', 'opening_balance', 'closing_balance'],
      properties: {
        total_in: NULLABLE_NUMBER,
        total_out: NULLABLE_NUMBER,
        opening_balance: NULLABLE_NUMBER,
        closing_balance: NULLABLE_NUMBER,
      },
    },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    if (!ANTHROPIC_API_KEY) return json(500, { error: 'AI is not configured.' })

    // --- Auth: require a signed-in user ---
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json(401, { error: 'Please sign in.' })

    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: ANON_KEY },
    })
    if (!userResp.ok) return json(401, { error: 'Please sign in again.' })
    const user = await userResp.json()

    // --- Premium gate (read the caller's own profile under RLS) ---
    const profResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=subscription_tier&id=eq.${user.id}`,
      { headers: { Authorization: authHeader, apikey: ANON_KEY } },
    )
    const profile = profResp.ok ? (await profResp.json())?.[0] : null
    if (profile?.subscription_tier !== 'premium') {
      return json(403, { error: 'AI statement reading is a Premium feature.' })
    }

    // --- Input ---
    const payload = await req.json().catch(() => ({}))
    const text: unknown = payload?.text
    const currency: unknown = payload?.currency
    if (typeof text !== 'string' || text.trim().length < 10) {
      return json(400, { error: 'No statement text to read.' })
    }
    if (text.length > 60000) {
      return json(413, { error: 'This statement is too large for AI reading.' })
    }

    // --- Ask Claude ---
    const userMsg =
      (typeof currency === 'string' && currency ? `Account currency: ${currency}\n\n` : '') +
      `Statement text:\n${text}`

    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }),
    })

    if (!aiResp.ok) {
      const detail = (await aiResp.text()).slice(0, 300)
      const status = aiResp.status === 429 ? 429 : 502
      return json(status, { error: 'The AI reader is busy — please try again in a moment.', detail })
    }

    const ai = await aiResp.json()
    if (ai?.stop_reason === 'max_tokens') {
      return json(422, { error: 'This statement has too many rows for one AI pass. Try importing it in parts.' })
    }
    const raw = ai?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '{}'
    let parsed: { transactions?: unknown; summary?: unknown }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return json(502, { error: 'The AI returned something Kura could not read.' })
    }
    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : []
    return json(200, { transactions, summary: parsed.summary ?? null })
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? 'Unexpected error.' })
  }
})
