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

// ---- Reordering ------------------------------------------------------------

// Rewrite sort_order = index for the given ids, in order. Returns the first
// error encountered (if any).
export async function persistOrder(table, orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from(table).update({ sort_order: i }).eq('id', id))
  )
  return results.find((r) => r.error) ?? { error: null }
}
