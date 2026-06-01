// Supabase data access for Chunk 1 structures: account groups, accounts,
// categories. RLS scopes every row to the signed-in user, so selects need no
// explicit user filter — but INSERTs must set user_id (the WITH CHECK policy
// requires user_id = auth.uid()). Callers pass the current user id for creates.
//
// Ordering: we keep a dense `sort_order` (0..n-1). Creates append at the end;
// reordering rewrites the whole list's sort_order so we never depend on the
// default 0 values colliding. Small lists, so writing every row is fine.

import { supabase } from '../supabaseClient'

// ---- Account groups --------------------------------------------------------

export function listGroups() {
  return supabase.from('account_groups').select('*').order('sort_order')
}

export function createGroup(userId, name, sortOrder) {
  return supabase
    .from('account_groups')
    .insert({ user_id: userId, name: name.trim(), sort_order: sortOrder })
    .select()
    .single()
}

export function renameGroup(id, name) {
  return supabase.from('account_groups').update({ name: name.trim() }).eq('id', id)
}

// Deleting a group must not orphan its accounts against the FK: detach them
// (group_id -> null) first, then remove the group.
export async function deleteGroup(id) {
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
  return supabase
    .from('accounts')
    .insert({ user_id: userId, sort_order: sortOrder, ...normalizeAccount(payload) })
    .select()
    .single()
}

// Currency is fixed at creation, so it is intentionally not updatable here.
export function updateAccount(id, payload) {
  const { currency, ...rest } = normalizeAccount(payload) // eslint-disable-line no-unused-vars
  return supabase.from('accounts').update(rest).eq('id', id)
}

export function deleteAccount(id) {
  return supabase.from('accounts').delete().eq('id', id)
}

export function setAccountArchived(id, archived) {
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
  return supabase.from('categories').update({ name: name.trim() }).eq('id', id)
}

export function deleteCategory(id) {
  return supabase.from('categories').delete().eq('id', id)
}

export function setCategoryArchived(id, archived) {
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
  'category:categories!transactions_category_id_fkey ( id, name, parent_id )'

// Transactions whose date falls in the given month (monthIndex is 0-based).
// Uses a half-open [first, nextMonth) date range on the `date` column.
export function listTransactionsForMonth(year, monthIndex) {
  const pad = (n) => String(n).padStart(2, '0')
  const first = `${year}-${pad(monthIndex + 1)}-01`
  const ny = monthIndex === 11 ? year + 1 : year
  const nm = monthIndex === 11 ? 0 : monthIndex + 1
  const next = `${ny}-${pad(nm + 1)}-01`
  return supabase
    .from('transactions')
    .select(TX_SELECT)
    .gte('date', first)
    .lt('date', next)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
}

// Bulk insert. `rows` are payloads without user_id (added here). currency is set
// authoritatively by the DB trigger from the account, so callers may omit it.
export function createTransactions(userId, rows) {
  return supabase
    .from('transactions')
    .insert(rows.map((r) => ({ user_id: userId, ...r })))
    .select()
}

// Distinct recent notes for the entry-screen typeahead (most-recent first).
export async function recentNotes(limit = 300) {
  const { data, error } = await supabase
    .from('transactions')
    .select('note')
    .not('note', 'is', null)
    .order('created_at', { ascending: false })
    .limit(800)
  if (error) return []
  const seen = new Set()
  const out = []
  for (const r of data ?? []) {
    const n = (r.note ?? '').trim()
    if (n && !seen.has(n.toLowerCase())) {
      seen.add(n.toLowerCase())
      out.push(n)
      if (out.length >= limit) break
    }
  }
  return out
}

// ---- Reordering ------------------------------------------------------------

// Rewrite sort_order = index for the given ids, in order. Returns the first
// error encountered (if any).
export async function persistOrder(table, orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from(table).update({ sort_order: i }).eq('id', id))
  )
  return results.find((r) => r.error) ?? { error: null }
}
