// JSON backup (de)serialization for Smara. Pure data shaping + validation only —
// the actual DB reads/writes live in lib/data.js (buildBackup gathers the rows,
// restoreFromBackup merges them back in). Keeping this file side-effect-free
// makes the file format easy to reason about and version.

export const BACKUP_FORMAT = 'smara.backup'
export const BACKUP_VERSION = 1

// Assemble the downloadable object from already-fetched rows. We keep the
// original ids (restore remaps them) and strip user_id (restore forces it to the
// importing user). created_at/updated_at are dropped — they're regenerated.
export function buildBackupObject({ baseCurrency, groups, accounts, categories, transactions, rates }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    base_currency: baseCurrency ?? 'IDR',
    data: {
      account_groups: (groups ?? []).map(pickGroup),
      accounts: (accounts ?? []).map(pickAccount),
      categories: (categories ?? []).map(pickCategory),
      transactions: (transactions ?? []).map(pickTransaction),
      exchange_rates: (rates ?? []).map(pickRate),
    },
  }
}

const pickGroup = (g) => ({ id: g.id, name: g.name, sort_order: g.sort_order ?? 0 })

const pickAccount = (a) => ({
  id: a.id,
  name: a.name,
  type: a.type,
  currency: a.currency,
  group_id: a.group_id ?? null,
  opening_balance: a.opening_balance ?? 0,
  settlement_day: a.settlement_day ?? null,
  payment_day: a.payment_day ?? null,
  archived: a.archived ?? false,
  sort_order: a.sort_order ?? 0,
})

const pickCategory = (c) => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  parent_id: c.parent_id ?? null,
  sort_order: c.sort_order ?? 0,
  archived: c.archived ?? false,
})

const pickTransaction = (t) => ({
  id: t.id,
  kind: t.kind,
  date: t.date,
  amount: t.amount,
  currency: t.currency,
  account_id: t.account_id,
  category_id: t.category_id ?? null,
  note: t.note ?? null,
  transfer_group_id: t.transfer_group_id ?? null,
  to_account_id: t.to_account_id ?? null,
  exchange_rate: t.exchange_rate ?? null,
  to_amount: t.to_amount ?? null,
})

const pickRate = (r) => ({ currency: r.currency, rate: r.rate })

// Validate a parsed backup object before we touch the database. Returns the
// object on success; throws an Error with a user-facing message otherwise.
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('That file is not a Smara backup.')
  }
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error('That file is not a Smara backup (wrong format).')
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new Error(`This backup was made by a newer version of Smara (v${obj.version}). Update the app, then try again.`)
  }
  const d = obj.data
  if (!d || typeof d !== 'object') throw new Error('This backup is missing its data.')
  for (const key of ['account_groups', 'accounts', 'categories', 'transactions', 'exchange_rates']) {
    if (d[key] != null && !Array.isArray(d[key])) {
      throw new Error(`This backup is corrupted (${key} is not a list).`)
    }
  }
  return obj
}

// A short human summary of what a backup file holds, for the restore confirm.
export function backupSummary(obj) {
  const d = obj?.data ?? {}
  return {
    accounts: (d.accounts ?? []).length,
    categories: (d.categories ?? []).length,
    transactions: (d.transactions ?? []).length,
    groups: (d.account_groups ?? []).length,
    rates: (d.exchange_rates ?? []).length,
    exported_at: obj?.exported_at ?? null,
  }
}
