// Supabase data access for Chunk 1 structures: account groups, accounts,
// categories. RLS scopes every row to the signed-in user, so selects need no
// explicit user filter — but INSERTs must set user_id (the WITH CHECK policy
// requires user_id = auth.uid()). Callers pass the current user id for creates.
//
// Ordering: we keep a dense `sort_order` (0..n-1). Creates append at the end;
// reordering rewrites the whole list's sort_order so we never depend on the
// default 0 values colliding. Small lists, so writing every row is fine.

import { supabase } from '../supabaseClient'
import { cacheClear } from './cache'

// ---- Account groups --------------------------------------------------------

export function listGroups() {
  return supabase.from('account_groups').select('*').order('sort_order')
}

export function createGroup(userId, name, sortOrder) {
  cacheClear()
  return supabase
    .from('account_groups')
    .insert({ user_id: userId, name: name.trim(), sort_order: sortOrder })
    .select()
    .single()
}

export function renameGroup(id, name) {
  cacheClear()
  return supabase.from('account_groups').update({ name: name.trim() }).eq('id', id)
}

// Deleting a group must not orphan its accounts against the FK: detach them
// (group_id -> null) first, then remove the group.
export async function deleteGroup(id) {
  cacheClear()
  const detach = await supabase.from('accounts').update({ group_id: null }).eq('group_id', id)
  if (detach.error) return detach
  return supabase.from('account_groups').delete().eq('id', id)
}

// ---- Accounts --------------------------------------------------------------

export function listAccounts() {
  return supabase.from('accounts').select('*').order('sort_order')
}

// payload: { name, type, currency, group_id, settlement_day, payment_day }
export function createAccount(userId, payload, sortOrder) {
  cacheClear()
  return supabase
    .from('accounts')
    .insert({ user_id: userId, sort_order: sortOrder, is_goal: payload.is_goal ?? false, ...normalizeAccount(payload) })
    .select()
    .single()
}

// Currency is fixed at creation, so it is intentionally not updatable here.
export function updateAccount(id, payload) {
  cacheClear()
  const { currency, ...rest } = normalizeAccount(payload) // eslint-disable-line no-unused-vars
  return supabase.from('accounts').update(rest).eq('id', id)
}

export function deleteAccount(id) {
  cacheClear()
  return supabase.from('accounts').delete().eq('id', id)
}

export function setAccountArchived(id, archived) {
  cacheClear()
  return supabase.from('accounts').update({ archived }).eq('id', id)
}

// Credit-card-only fields are scrubbed for other types (the DB range-checks them
// but does not force null), and empty strings become null.
function normalizeAccount(p) {
  const isCC = p.type === 'credit_card'
  return {
    name: p.name?.trim(),
    type: p.type,
    currency: p.currency,
    group_id: p.group_id || null,
    opening_balance: Number(p.opening_balance) || 0,
    settlement_day: isCC ? toDay(p.settlement_day) : null,
    payment_day: isCC ? toDay(p.payment_day) : null,
  }
}

function toDay(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
}

// ---- Categories ------------------------------------------------------------

export function listCategories() {
  return supabase.from('categories').select('*').order('sort_order')
}

// payload: { kind, name, parent_id }
export function createCategory(userId, payload, sortOrder) {
  cacheClear()
  return supabase
    .from('categories')
    .insert({
      user_id: userId,
      kind: payload.kind,
      name: payload.name.trim(),
      parent_id: payload.parent_id || null,
      sort_order: sortOrder,
    })
    .select()
    .single()
}

// Only the name is editable post-create (kind/parent moves would complicate the
// depth rules; users delete + recreate to move a category).
export function renameCategory(id, name) {
  cacheClear()
  return supabase.from('categories').update({ name: name.trim() }).eq('id', id)
}

export function deleteCategory(id) {
  cacheClear()
  return supabase.from('categories').delete().eq('id', id)
}

export function setCategoryArchived(id, archived) {
  cacheClear()
  return supabase.from('categories').update({ archived }).eq('id', id)
}

// ---- Transactions ----------------------------------------------------------

// Nested select: each row carries its account (name/currency/type) and its
// category (id/name/parent_id). The parent category's NAME is resolved client
// side from a categories map — a self-join embed here is ambiguous in PostgREST
// (the column hint returns children, the constraint hint isn't found).
const TX_SELECT =
  '*, ' +
  'account:accounts!transactions_account_id_fkey ( id, name, currency, type ), ' +
  'to_account:accounts!transactions_to_account_id_fkey ( id, name, currency ), ' +
  'category:categories!transactions_category_id_fkey ( id, name, parent_id )'

// Supabase's API caps a single response at 1000 rows, which would silently
// truncate balances, ledgers, exports and backups for a heavy user (thousands
// of transactions). So any query that can exceed that pages through with
// .range() and concatenates. `buildQuery` must return a FRESH builder each call
// (select + filters + order applied) so the range can be re-applied per page.
// Every paged query MUST end on a unique tiebreaker (`id`): bulk CSV imports
// give many rows the same created_at, and without a unique final sort key rows
// could be skipped or duplicated across a page boundary. Returns { data, error }.
async function fetchAllPages(buildQuery, pageSize = 1000) {
  const all = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return { data: all, error: null }
}

// Transactions whose date falls in the given month (monthIndex is 0-based).
// Uses a half-open [first, nextMonth) date range on the `date` column.
export function listTransactionsForMonth(year, monthIndex) {
  const pad = (n) => String(n).padStart(2, '0')
  const first = `${year}-${pad(monthIndex + 1)}-01`
  const ny = monthIndex === 11 ? year + 1 : year
  const nm = monthIndex === 11 ? 0 : monthIndex + 1
  const next = `${ny}-${pad(nm + 1)}-01`
  return fetchAllPages(() => supabase
    .from('transactions')
    .select(TX_SELECT)
    .gte('date', first)
    .lt('date', next)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))
}

// Bulk insert. `rows` are payloads without user_id (added here). currency is set
// authoritatively by the DB trigger from the account, so callers may omit it.
export function createTransactions(userId, rows) {
  cacheClear()
  return supabase
    .from('transactions')
    .insert(rows.map((r) => ({ user_id: userId, ...r })))
    .select()
}

// ---- Goals -----------------------------------------------------------------

export function listGoals() {
  return supabase.from('goals').select('*').order('created_at', { ascending: true })
}

// Creating a goal also creates its dedicated account (the saved money lives
// there and counts in net worth). Returns { data: goal, account, error }.
export async function createGoal(userId, { name, target_amount, deadline, preset, emoji, currency }) {
  cacheClear()
  const existing = await listAccounts()
  const sortOrder = existing.data?.length ?? 0
  const { data: account, error: aerr } = await createAccount(
    userId,
    { name: name?.trim(), type: 'bank', currency, opening_balance: 0, is_goal: true },
    sortOrder,
  )
  if (aerr || !account) return { data: null, account: null, error: aerr ?? new Error('Could not create the goal account') }
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      account_id: account.id,
      name: name?.trim(),
      target_amount,
      deadline: deadline || null,
      preset: preset || null,
      emoji: emoji || null,
    })
    .select()
    .single()
  return { data, account, error }
}

// Only name / target / deadline / status are editable (currency + account are fixed).
export function updateGoal(id, patch) {
  cacheClear()
  return supabase.from('goals').update(patch).eq('id', id)
}

// Deletes a goal AND its dedicated account, returning any contributed money to
// the accounts it came from (deleting a transfer restores the funding account's
// balance). Goal accounts are hidden from the Accounts list, so we don't leave
// one behind. Transactions touching the account must go first (FK protects them),
// then the account delete cascades the goal row.
export async function deleteGoalAndAccount(goalId, accountId) {
  cacheClear()
  if (accountId) {
    await supabase.from('transactions').delete().or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
    const { error } = await supabase.from('accounts').delete().eq('id', accountId)
    if (error) return { error }
  }
  return supabase.from('goals').delete().eq('id', goalId)
}

// Contribute to a goal: a same-currency transfer from a funding account into the
// goal's account.
export function addToGoal(userId, { fromAccountId, goalAccountId, amount, date }) {
  return createTransactions(userId, [{
    kind: 'transfer',
    date,
    amount,
    account_id: fromAccountId,
    to_account_id: goalAccountId,
    to_amount: amount,
    exchange_rate: null,
    category_id: null,
    note: null,
  }])
}

// Transactions whose date falls in the half-open [startISO, endExclusiveISO)
// range, richest select (for the Stats page). Newest first.
export function listTransactionsInRange(startISO, endExclusiveISO) {
  return fetchAllPages(() => supabase
    .from('transactions')
    .select(TX_SELECT)
    .gte('date', startISO)
    .lt('date', endExclusiveISO)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))
}

// All-time note search (case-insensitive substring). Returns rich rows so the
// search results render with the shared 2-line row and tap → /tx/:id. `%` and
// `_` in the query are escaped so they match literally, not as SQL wildcards.
export function searchTransactions(query, limit = 200) {
  const q = (query ?? '').trim()
  if (!q) return Promise.resolve({ data: [], error: null })
  const safe = q.replace(/[\\%_]/g, (c) => '\\' + c)
  return supabase
    .from('transactions')
    .select(TX_SELECT)
    .ilike('note', `%${safe}%`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
}

// Single transaction with its account/to_account/category embeds (for editing).
export function getTransaction(id) {
  return supabase.from('transactions').select(TX_SELECT).eq('id', id).single()
}

export function updateTransaction(id, fields) {
  cacheClear()
  return supabase.from('transactions').update(fields).eq('id', id)
}

export function deleteTransaction(id) {
  cacheClear()
  return supabase.from('transactions').delete().eq('id', id)
}

export function deleteTransactions(ids) {
  cacheClear()
  return supabase.from('transactions').delete().in('id', ids)
}

// Distinct transaction notes for the entry-screen typeahead, most-recently-used
// first. Uses a DB DISTINCT aggregate over the WHOLE history (via distinct_notes
// RPC) — the old approach only scanned the 800 newest rows, so older notes
// weren't suggested once a user had thousands of transactions.
export async function recentNotes() {
  const { data, error } = await supabase.rpc('distinct_notes')
  if (error) return []
  return (data ?? []).map((r) => r.note).filter(Boolean)
}

// All transactions (minimal fields) for client-side balance + credit-card math.
// Ordered by the unique id so pagination is stable (the values themselves are
// summed, so the order is otherwise irrelevant).
export function listAllTransactions() {
  return fetchAllPages(() => supabase
    .from('transactions')
    .select('id, kind, amount, account_id, to_account_id, to_amount, date')
    .order('id', { ascending: true }))
}

// Every transaction with the rich embeds, newest first (for CSV export + JSON
// backup — both want the whole history regardless of month).
export function listAllTransactionsFull() {
  return fetchAllPages(() => supabase
    .from('transactions')
    .select(TX_SELECT)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))
}

// Per-account balances computed in the DB (so the Accounts page / net worth
// doesn't fetch every transaction once a user has thousands). [{ account_id,
// balance }] in each account's own currency; the client converts to base.
export function getAccountBalances() {
  return supabase.rpc('account_balances')
}

// One account's full history (rich embeds) for its ledger — server-side filtered
// to the rows that touch this account, instead of the whole history.
export function listAccountTransactionsFull(accountId) {
  return fetchAllPages(() => supabase
    .from('transactions')
    .select(TX_SELECT)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false }))
}

// Minimal transactions touching any of the given accounts — for the credit-card
// billing detail on the Accounts page (only the CC accounts, so it's small).
export function listTransactionsForAccounts(accountIds) {
  if (!accountIds.length) return Promise.resolve({ data: [], error: null })
  const ids = accountIds.join(',')
  return fetchAllPages(() => supabase
    .from('transactions')
    .select('id, kind, amount, account_id, to_account_id, to_amount, date')
    .or(`account_id.in.(${ids}),to_account_id.in.(${ids})`)
    .order('id', { ascending: true }))
}

// ---- Budgets (Session 12) --------------------------------------------------
// Per-category spending caps: recurring (week/month/year) or one-off (custom
// start/end window). Per-currency, no conversion. RLS scopes rows to the owner;
// INSERTs must set user_id. Spend is computed client-side from the existing
// transaction queries (a period is within the paginated range fetches).

export function listBudgets() {
  return supabase.from('budgets').select('*').order('created_at', { ascending: true })
}

// payload: { category_id, period, currency, amount, start_date?, end_date?, label? }
export function createBudget(userId, payload) {
  cacheClear()
  return supabase.from('budgets').insert({ user_id: userId, ...payload }).select().single()
}

export function updateBudget(id, patch) {
  cacheClear()
  return supabase.from('budgets').update(patch).eq('id', id)
}

export function deleteBudget(id) {
  cacheClear()
  return supabase.from('budgets').delete().eq('id', id)
}

// ---- Per-month budget amounts (Budget v2) ----------------------------------
// Effective-dated schedule: amount(M) = latest from_month <= M, else
// budgets.amount. from_month is the first day of the month it takes effect.

export function listBudgetAmounts() {
  return supabase.from('budget_amounts').select('*').order('from_month', { ascending: true })
}

export function upsertBudgetAmount(userId, budgetId, fromMonth, amount) {
  cacheClear()
  return supabase
    .from('budget_amounts')
    .upsert({ user_id: userId, budget_id: budgetId, from_month: fromMonth, amount }, { onConflict: 'budget_id,from_month' })
}

export function deleteBudgetAmount(budgetId, fromMonth) {
  cacheClear()
  return supabase.from('budget_amounts').delete().eq('budget_id', budgetId).eq('from_month', fromMonth)
}

// ---- Exchange rates (manual, value of 1 unit of currency in base currency) --

export function listRates() {
  return supabase.from('exchange_rates').select('*')
}

export function upsertRate(userId, currency, rate) {
  cacheClear()
  return supabase
    .from('exchange_rates')
    .upsert({ user_id: userId, currency, rate }, { onConflict: 'user_id,currency' })
}

export function deleteRate(userId, currency) {
  cacheClear()
  return supabase.from('exchange_rates').delete().eq('user_id', userId).eq('currency', currency)
}

// ---- Backup / restore / import (Chunk 5) -----------------------------------

const norm = (s) => (s ?? '').trim().toLowerCase()

// Insert transactions in chunks so a very large history doesn't hit request
// limits. Returns { inserted, error } (first error stops the run).
async function insertTransactionsChunked(userId, rows, size = 500, onProgress) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size)
    const { error } = await createTransactions(userId, slice)
    if (error) return { inserted, error }
    inserted += slice.length
    onProgress?.(inserted, rows.length)
  }
  return { inserted, error: null }
}

// Find an existing category by (kind, name, parent) or create it; mutates
// `existing` so repeated lookups within one run reuse what we just made.
// Returns { id, created }.
async function ensureCategory(userId, kind, name, parentId, existing) {
  const match = existing.find(
    (c) => c.kind === kind && norm(c.name) === norm(name) && (c.parent_id ?? null) === (parentId ?? null)
  )
  if (match) return { id: match.id, created: false }
  const { data, error } = await createCategory(userId, { kind, name, parent_id: parentId ?? null }, existing.length)
  if (error) throw error
  existing.push(data)
  return { id: data.id, created: true }
}

// Merge a validated backup into the signed-in user's data (the restore model
// Stanley chose). Structure (groups/accounts/categories) is matched by name and
// reused if present, else created — so accounts never duplicate. Exchange rates
// are upserted. Transactions are always inserted (re-pointed at the matched
// accounts/categories), so re-running a restore adds them again by design.
// Inserts run structure-first to satisfy the DB integrity trigger + FKs.
export async function restoreFromBackup(userId, backup) {
  cacheClear()
  const d = backup.data ?? {}
  const summary = { groupsCreated: 0, accountsCreated: 0, categoriesCreated: 0, ratesSet: 0, transactionsAdded: 0 }

  const [groupsR, accountsR, catsR] = await Promise.all([listGroups(), listAccounts(), listCategories()])
  if (groupsR.error) throw groupsR.error
  if (accountsR.error) throw accountsR.error
  if (catsR.error) throw catsR.error
  const exGroups = groupsR.data ?? []
  const exAccounts = accountsR.data ?? []
  const exCats = catsR.data ?? []

  // Groups: match-or-create by name. oldId -> id.
  const groupMap = {}
  for (const g of d.account_groups ?? []) {
    const found = exGroups.find((e) => norm(e.name) === norm(g.name))
    if (found) { groupMap[g.id] = found.id; continue }
    const { data, error } = await createGroup(userId, g.name, g.sort_order ?? exGroups.length)
    if (error) throw error
    exGroups.push(data)
    groupMap[g.id] = data.id
    summary.groupsCreated++
  }

  // Accounts: match-or-create by name + currency (currency is fixed per account).
  const accountMap = {}
  for (const a of d.accounts ?? []) {
    const found = exAccounts.find((e) => norm(e.name) === norm(a.name) && e.currency === a.currency)
    if (found) { accountMap[a.id] = found.id; continue }
    const { data, error } = await createAccount(
      userId,
      {
        name: a.name,
        type: a.type,
        currency: a.currency,
        group_id: a.group_id ? groupMap[a.group_id] ?? null : null,
        opening_balance: a.opening_balance ?? 0,
        settlement_day: a.settlement_day,
        payment_day: a.payment_day,
      },
      a.sort_order ?? exAccounts.length
    )
    if (error) throw error
    exAccounts.push(data)
    accountMap[a.id] = data.id
    summary.accountsCreated++
  }

  // Categories: parents first so children can map their new parent id.
  const catMap = {}
  const cats = d.categories ?? []
  for (const c of cats.filter((c) => !c.parent_id)) {
    const r = await ensureCategory(userId, c.kind, c.name, null, exCats)
    catMap[c.id] = r.id
    if (r.created) summary.categoriesCreated++
  }
  for (const c of cats.filter((c) => c.parent_id)) {
    const parentNew = catMap[c.parent_id] ?? null
    const r = await ensureCategory(userId, c.kind, c.name, parentNew, exCats)
    catMap[c.id] = r.id
    if (r.created) summary.categoriesCreated++
  }

  // Exchange rates: upsert by currency.
  for (const r of d.exchange_rates ?? []) {
    const { error } = await upsertRate(userId, r.currency, r.rate)
    if (error) throw error
    summary.ratesSet++
  }

  // Transactions: always insert, re-pointed at the matched structure.
  const rows = []
  for (const t of d.transactions ?? []) {
    const account_id = accountMap[t.account_id]
    if (!account_id) continue // its account couldn't be created/matched — skip rather than orphan
    rows.push({
      kind: t.kind,
      date: t.date,
      amount: t.amount,
      account_id,
      category_id: t.category_id ? catMap[t.category_id] ?? null : null,
      note: t.note ?? null,
      transfer_group_id: t.transfer_group_id ?? null,
      to_account_id: t.to_account_id ? accountMap[t.to_account_id] ?? null : null,
      exchange_rate: t.exchange_rate ?? null,
      to_amount: t.to_amount ?? null,
    })
  }
  const ins = await insertTransactionsChunked(userId, rows)
  if (ins.error) throw ins.error
  summary.transactionsAdded = ins.inserted
  return summary
}

// Import a Kura-format transactions CSV (array of header-keyed row objects).
// Accounts must already exist (matched by name) — unknown ones are skipped and
// reported (import never creates accounts or deletes anything). Missing
// categories are auto-created. Returns { inserted, skipped:[{line,reason}],
// categoriesCreated }.
export async function importKuraTransactions(userId, parsedRows) {
  cacheClear()
  const [accountsR, catsR] = await Promise.all([listAccounts(), listCategories()])
  if (accountsR.error) throw accountsR.error
  if (catsR.error) throw catsR.error
  const accounts = accountsR.data ?? []
  const exCats = catsR.data ?? []
  const accountByName = (n) => accounts.find((a) => norm(a.name) === norm(n))

  const skipped = []
  const payloads = []
  let categoriesCreated = 0

  for (let i = 0; i < parsedRows.length; i++) {
    const r = parsedRows[i]
    const line = i + 2 // +1 for the header row, +1 for 1-based display
    const kind = norm(r.kind)
    if (!['income', 'expense', 'transfer'].includes(kind)) {
      skipped.push({ line, reason: `unknown kind "${r.kind || ''}"` })
      continue
    }
    const date = (r.date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push({ line, reason: `invalid date "${r.date || ''}" (need YYYY-MM-DD)` })
      continue
    }
    const amount = Number(r.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      skipped.push({ line, reason: `invalid amount "${r.amount || ''}"` })
      continue
    }
    const account = accountByName(r.account)
    if (!account) {
      skipped.push({ line, reason: `unknown account "${r.account || ''}"` })
      continue
    }

    const base = { kind, date, amount, account_id: account.id, note: (r.note ?? '').trim() || null }

    if (kind === 'transfer') {
      const dest = accountByName(r.to_account)
      if (!dest) {
        skipped.push({ line, reason: `unknown destination account "${r.to_account || ''}"` })
        continue
      }
      if (dest.id === account.id) {
        skipped.push({ line, reason: 'transfer source and destination are the same account' })
        continue
      }
      const toAmount = Number(r.to_amount)
      payloads.push({
        ...base,
        to_account_id: dest.id,
        to_amount: Number.isFinite(toAmount) && toAmount > 0 ? toAmount : null,
      })
    } else {
      // income / expense: resolve (category, sub_category) -> a category id.
      let categoryId = null
      const catName = (r.category ?? '').trim()
      const subName = (r.sub_category ?? '').trim()
      try {
        if (catName) {
          const parent = await ensureCategory(userId, kind, catName, null, exCats)
          if (parent.created) categoriesCreated++
          if (subName) {
            const child = await ensureCategory(userId, kind, subName, parent.id, exCats)
            if (child.created) categoriesCreated++
            categoryId = child.id
          } else {
            categoryId = parent.id
          }
        }
      } catch (e) {
        skipped.push({ line, reason: `could not create category (${e.message})` })
        continue
      }
      payloads.push({ ...base, category_id: categoryId })
    }
  }

  const ins = await insertTransactionsChunked(userId, payloads)
  if (ins.error) throw ins.error
  return { inserted: ins.inserted, skipped, categoriesCreated }
}

// ---- App migration / import batches (Session 13) ---------------------------
// Bring a whole history in from another expense tracker. Unlike
// importKuraTransactions (which skips unknown accounts), migration RESOLVES
// every source account up front via an account plan the user confirmed —
// creating new accounts or merging into existing ones — then tags every
// inserted row with an import_batch_id so the whole import can be undone.

export function listImportBatches() {
  return supabase.from('import_batches').select('*').order('created_at', { ascending: false })
}

// Open an empty batch (for importers that insert rows themselves, e.g. the bank-
// statement converter, so their inserts can be tagged + undone as a unit).
export function createImportBatch(userId, meta = {}) {
  return supabase
    .from('import_batches')
    .insert({ user_id: userId, source: meta.source ?? null, label: meta.label ?? null, count: 0 })
    .select()
    .single()
}

export function setImportBatchCount(batchId, count) {
  return supabase.from('import_batches').update({ count }).eq('id', batchId)
}

// Undo an import: delete its tagged transactions (RLS scopes to the owner),
// then the batch record. Returns { error }.
export async function undoImport(batchId) {
  cacheClear()
  const del = await supabase.from('transactions').delete().eq('import_batch_id', batchId)
  if (del.error) return del
  return supabase.from('import_batches').delete().eq('id', batchId)
}

// Import normalized migration rows (from lib/migrate). `accountPlan` is the
// user-confirmed resolution for each source account name:
//   [{ source, action:'create'|'merge'|'skip', accountId?, name?, type?, currency?, groupId? }]
// `meta` is { source, label }. Returns { batchId, inserted, skipped, accountsCreated, categoriesCreated }.
export async function importMigration(userId, rows, accountPlan, meta = {}, onProgress) {
  cacheClear()
  const skipped = []

  // 1) Open a batch so every inserted row can be rolled back together.
  const batchR = await supabase
    .from('import_batches')
    .insert({ user_id: userId, source: meta.source ?? null, label: meta.label ?? null, count: 0 })
    .select()
    .single()
  if (batchR.error) throw batchR.error
  const batchId = batchR.data.id

  try {
    // 2) Resolve accounts from the plan: create new ones, reuse merges.
    const accountsR = await listAccounts()
    if (accountsR.error) throw accountsR.error
    const exAccounts = accountsR.data ?? []
    const nameToId = new Map() // normalized source name -> account id (or null = skip)
    let accountsCreated = 0
    for (const p of accountPlan ?? []) {
      const key = norm(p.source)
      if (p.action === 'skip') { nameToId.set(key, null); continue }
      if (p.action === 'merge') { nameToId.set(key, p.accountId); continue }
      // create
      const { data, error } = await createAccount(
        userId,
        {
          name: p.name ?? p.source,
          type: p.type ?? 'bank',
          currency: p.currency ?? 'IDR',
          group_id: p.groupId ?? null,
          opening_balance: 0,
        },
        exAccounts.length
      )
      if (error) throw error
      exAccounts.push(data)
      nameToId.set(key, data.id)
      accountsCreated++
    }

    // 3) Categories: match-or-create as we go (income/expense only).
    const catsR = await listCategories()
    if (catsR.error) throw catsR.error
    const exCats = catsR.data ?? []
    let categoriesCreated = 0

    // 4) Build payloads, each tagged with the batch id.
    const payloads = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const line = i + 1
      const accountId = nameToId.get(norm(r.account))
      if (!accountId) { skipped.push({ line, reason: `account "${r.account}" not imported` }); continue }

      const base = { date: r.date, amount: r.amount, account_id: accountId, note: r.note || null, import_batch_id: batchId }

      if (r.type === 'transfer') {
        const toId = nameToId.get(norm(r.toAccount))
        if (!toId) { skipped.push({ line, reason: `transfer destination "${r.toAccount}" not imported` }); continue }
        if (toId === accountId) { skipped.push({ line, reason: 'transfer to the same account' }); continue }
        payloads.push({ ...base, kind: 'transfer', to_account_id: toId, to_amount: r.amount })
      } else {
        let categoryId = null
        try {
          if (r.category) {
            const parent = await ensureCategory(userId, r.type, r.category, null, exCats)
            if (parent.created) categoriesCreated++
            if (r.subCategory) {
              const child = await ensureCategory(userId, r.type, r.subCategory, parent.id, exCats)
              if (child.created) categoriesCreated++
              categoryId = child.id
            } else {
              categoryId = parent.id
            }
          }
        } catch (e) {
          skipped.push({ line, reason: `could not create category (${e.message})` }); continue
        }
        payloads.push({ ...base, kind: r.type, category_id: categoryId })
      }
    }

    // 5) Insert in chunks, then record the final count on the batch.
    const ins = await insertTransactionsChunked(userId, payloads, 500, onProgress)
    if (ins.error) throw ins.error
    await supabase.from('import_batches').update({ count: ins.inserted }).eq('id', batchId)

    // The accounts this import touched (created or merged into), so the caller
    // can show each one's resulting balance for the user to sanity-check.
    const touchedIds = new Set([...nameToId.values()].filter(Boolean))
    const accounts = exAccounts
      .filter((a) => touchedIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name, currency: a.currency }))

    return { batchId, inserted: ins.inserted, skipped, accountsCreated, categoriesCreated, accounts }
  } catch (e) {
    // Roll the batch back so a failed import doesn't leave a phantom record or
    // a half-inserted set the user can't find to undo.
    await undoImport(batchId)
    throw e
  }
}

// ---- Reset (destructive) ---------------------------------------------------

// Delete every transaction (keeps accounts/categories/groups/rates).
export function deleteAllTransactions(userId) {
  cacheClear()
  return supabase.from('transactions').delete().eq('user_id', userId)
}

// Delete one account's transactions, including transfers where it's the
// destination leg.
export function deleteAccountTransactions(userId, accountId) {
  cacheClear()
  return supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
}

// Wipe everything: transactions, rates, categories (children before parents to
// respect the self-FK), accounts, then groups. Stops at the first error.
export async function fullReset(userId) {
  cacheClear()
  const steps = [
    () => supabase.from('transactions').delete().eq('user_id', userId),
    () => supabase.from('exchange_rates').delete().eq('user_id', userId),
    () => supabase.from('categories').delete().eq('user_id', userId).not('parent_id', 'is', null),
    () => supabase.from('categories').delete().eq('user_id', userId).is('parent_id', null),
    () => supabase.from('accounts').delete().eq('user_id', userId),
    () => supabase.from('account_groups').delete().eq('user_id', userId),
  ]
  for (const step of steps) {
    const { error } = await step()
    if (error) return { error }
  }
  return { error: null }
}

// ---- Admin (Chunk 8) -------------------------------------------------------
// All three go through SECURITY DEFINER RPCs that re-check the caller is an
// admin server-side; the client `role` check only decides what UI to show.

export function adminListUsers() {
  return supabase.rpc('admin_list_users')
}

export function adminSetTier(targetId, tier) {
  return supabase.rpc('admin_set_tier', { target_id: targetId, new_tier: tier })
}

export function adminSetRole(targetId, role) {
  return supabase.rpc('admin_set_role', { target_id: targetId, new_role: role })
}

// ---- Editable documents (Chunk 9) ------------------------------------------
// Published content (Privacy / Terms / Help-FAQ). Public read via RLS (so the
// pages render signed-out); the admin write goes through a SECURITY DEFINER RPC
// that re-checks is_admin(). Pages fall back to bundled defaults if no row.

export function getDocument(slug) {
  return supabase.from('documents').select('*').eq('slug', slug).maybeSingle()
}

export function adminUpsertDocument(slug, title, body) {
  return supabase.rpc('admin_upsert_document', { doc_slug: slug, doc_title: title, doc_body: body })
}

// ---- Account management (Account chunk) ------------------------------------
// Wipes the caller's data and removes their auth user. SECURITY DEFINER RPC that
// only ever acts on auth.uid() — irreversible; the UI gates it behind a typed
// confirmation and signs out afterwards.
export function deleteOwnAccount() {
  cacheClear()
  return supabase.rpc('delete_own_account')
}

// ---- Reordering ------------------------------------------------------------

// Rewrite sort_order = index for the given ids, in order. Returns the first
// error encountered (if any).
export async function persistOrder(table, orderedIds) {
  cacheClear()
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from(table).update({ sort_order: i }).eq('id', id))
  )
  return results.find((r) => r.error) ?? { error: null }
}
