import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import { useMonth } from '../MonthContext'
import ResponsiveSelect from '../components/ResponsiveSelect'
import DatePicker from '../components/DatePicker'
import { Button, Field, Modal, ConfirmDialog, TextInput, inputClass } from '../components/ui'
import { DownloadIcon, UploadIcon } from '../lib/icons'
import {
  listGroups, listAccounts, listCategories, listRates,
  listAllTransactions, listAllTransactionsFull, listTransactionsInRange,
  restoreFromBackup, importKuraTransactions,
  deleteAllTransactions, deleteAccountTransactions, fullReset,
} from '../lib/data'
import { transactionsToCSV, parseTransactionsCSV, downloadFile, datedFilename } from '../lib/csv'
import { buildBackupObject, validateBackup, backupSummary } from '../lib/backup'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function SectionTitle({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-wide text-faint mt-6 mb-2 px-1 first:mt-0">
      {children}
    </div>
  )
}

function Card({ children, danger }) {
  return (
    <div className={`bg-surface border rounded-[14px] p-4 ${danger ? 'border-expense/40' : 'border-border'}`}>
      {children}
    </div>
  )
}

const pad = (n) => String(n).padStart(2, '0')

function monthRange(year, monthIndex) {
  const first = `${year}-${pad(monthIndex + 1)}-01`
  const ny = monthIndex === 11 ? year + 1 : year
  const nm = monthIndex === 11 ? 0 : monthIndex + 1
  const next = `${ny}-${pad(nm + 1)}-01`
  return [first, next]
}

function nextDayISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
}

export default function SettingsData() {
  const { user, profile, updateProfile } = useAuth()
  const { year, monthIndex } = useMonth()

  const [accounts, setAccounts] = useState([])
  const [txCount, setTxCount] = useState(null)
  const [busy, setBusy] = useState(null) // which action is running
  const [status, setStatus] = useState(null) // { tone:'ok'|'err'|'warn', text, detail? }

  // Export
  const [scope, setScope] = useState('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Restore / import staging
  const [pendingRestore, setPendingRestore] = useState(null)
  const [pendingImport, setPendingImport] = useState(null)
  const restoreInput = useRef(null)
  const importInput = useRef(null)

  // Reset
  const [resetMode, setResetMode] = useState(null) // 'all' | 'account' | 'full'
  const [resetAccount, setResetAccount] = useState('')
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => { loadMeta() }, [])

  async function loadMeta() {
    const [a, t] = await Promise.all([listAccounts(), listAllTransactions()])
    setAccounts(a.data ?? [])
    setTxCount(t.error ? null : (t.data ?? []).length)
  }

  // ---- Export --------------------------------------------------------------
  async function handleExport() {
    setBusy('export'); setStatus(null)
    try {
      let res
      if (scope === 'all') {
        res = await listAllTransactionsFull()
      } else if (scope === 'month') {
        const [a, b] = monthRange(year, monthIndex)
        res = await listTransactionsInRange(a, b)
      } else {
        if (!customFrom || !customTo) { setStatus({ tone: 'err', text: 'Pick both a start and end date.' }); return }
        const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom]
        res = await listTransactionsInRange(from, nextDayISO(to))
      }
      if (res.error) throw res.error
      const rows = res.data ?? []
      if (rows.length === 0) { setStatus({ tone: 'err', text: 'No transactions in that range.' }); return }
      const cats = await listCategories()
      if (cats.error) throw cats.error
      const catById = new Map((cats.data ?? []).map((c) => [c.id, c]))
      const csv = transactionsToCSV(rows, catById)
      downloadFile(datedFilename('kura-transactions', 'csv'), csv, 'text/csv;charset=utf-8')
      setStatus({ tone: 'ok', text: `Exported ${rows.length} transaction${rows.length === 1 ? '' : 's'} to CSV.` })
    } catch (e) {
      setStatus({ tone: 'err', text: e.message ?? 'Export failed.' })
    } finally { setBusy(null) }
  }

  // ---- Backup --------------------------------------------------------------
  async function handleBackup() {
    setBusy('backup'); setStatus(null)
    try {
      const [g, a, c, t, r] = await Promise.all([
        listGroups(), listAccounts(), listCategories(), listAllTransactionsFull(), listRates(),
      ])
      for (const x of [g, a, c, t, r]) if (x.error) throw x.error
      const obj = buildBackupObject({
        baseCurrency: profile?.base_currency,
        groups: g.data, accounts: a.data, categories: c.data, transactions: t.data, rates: r.data,
      })
      downloadFile(datedFilename('kura-backup', 'json'), JSON.stringify(obj, null, 2), 'application/json')
      setStatus({ tone: 'ok', text: `Backup downloaded — ${obj.data.transactions.length} transactions, ${obj.data.accounts.length} accounts.` })
    } catch (e) {
      setStatus({ tone: 'err', text: e.message ?? 'Backup failed.' })
    } finally { setBusy(null) }
  }

  // ---- Restore -------------------------------------------------------------
  async function onRestoreFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    try {
      const obj = validateBackup(JSON.parse(await file.text()))
      setPendingRestore(obj)
    } catch (err) {
      setStatus({ tone: 'err', text: err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message })
    }
  }

  async function confirmRestore() {
    setBusy('restore')
    try {
      const summary = await restoreFromBackup(user.id, pendingRestore)
      const bc = pendingRestore.base_currency
      if (bc && bc !== profile?.base_currency) await updateProfile({ base_currency: bc })
      setPendingRestore(null)
      await loadMeta()
      setStatus({
        tone: 'ok',
        text: `Restored — added ${summary.transactionsAdded} transactions, ${summary.accountsCreated} accounts, ${summary.categoriesCreated} categories.`,
      })
    } catch (e) {
      setStatus({ tone: 'err', text: e.message ?? 'Restore failed.' })
    } finally { setBusy(null) }
  }

  // ---- Import --------------------------------------------------------------
  async function onImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStatus(null)
    try {
      const { rows } = parseTransactionsCSV(await file.text())
      if (rows.length === 0) { setStatus({ tone: 'err', text: 'That CSV has no data rows.' }); return }
      setPendingImport(rows)
    } catch (err) {
      setStatus({ tone: 'err', text: err.message ?? 'Could not read that file.' })
    }
  }

  async function confirmImport() {
    setBusy('import')
    try {
      const res = await importKuraTransactions(user.id, pendingImport)
      setPendingImport(null)
      await loadMeta()
      const parts = [`Imported ${res.inserted} transaction${res.inserted === 1 ? '' : 's'}`]
      if (res.categoriesCreated) parts.push(`${res.categoriesCreated} new categor${res.categoriesCreated === 1 ? 'y' : 'ies'}`)
      if (res.skipped.length) parts.push(`${res.skipped.length} skipped`)
      setStatus({ tone: res.skipped.length ? 'warn' : 'ok', text: parts.join(' · '), detail: res.skipped })
    } catch (e) {
      setStatus({ tone: 'err', text: e.message ?? 'Import failed.' })
    } finally { setBusy(null) }
  }

  // ---- Reset ---------------------------------------------------------------
  async function runReset() {
    setBusy('reset')
    try {
      let res
      if (resetMode === 'all') res = await deleteAllTransactions(user.id)
      else if (resetMode === 'account') res = await deleteAccountTransactions(user.id, resetAccount)
      else res = await fullReset(user.id)
      if (res.error) throw res.error
      const mode = resetMode
      closeReset()
      if (mode === 'full') { setResetAccount(''); setScope('month') }
      await loadMeta()
      setStatus({
        tone: 'ok',
        text: mode === 'full' ? 'Everything deleted. Your account is now empty.'
          : mode === 'account' ? 'That account’s transactions were deleted.'
          : 'All transactions deleted (accounts & categories kept).',
      })
    } catch (e) {
      setStatus({ tone: 'err', text: e.message ?? 'Reset failed.' })
    } finally { setBusy(null) }
  }

  function closeReset() { setResetMode(null); setConfirmText('') }

  const accountOptions = accounts.map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}` }))
  const selectedAccountName = accounts.find((a) => a.id === resetAccount)?.name ?? 'this account'
  const fullReady = confirmText.trim().toUpperCase() === 'RESET'

  const scopeLabel = scope === 'month' ? `${MONTHS[monthIndex]} ${year}` : scope === 'all' ? 'all time' : 'a date range'

  return (
    <div className="max-w-[640px] mx-auto pb-4">
      {status && (
        <div
          className={`mb-3 rounded-xl border px-3.5 py-3 text-[13.5px] ${
            status.tone === 'ok' ? 'border-income/40 bg-income/10 text-income'
              : status.tone === 'warn' ? 'border-transfer/40 bg-transfer/10 text-transfer'
              : 'border-expense/40 bg-expense/10 text-expense'
          }`}
        >
          <div className="font-semibold">{status.text}</div>
          {status.detail?.length > 0 && (
            <ul className="mt-1.5 text-[12px] text-muted list-disc pl-4 space-y-0.5 max-h-40 overflow-y-auto">
              {status.detail.slice(0, 50).map((s, i) => (
                <li key={i}>Line {s.line}: {s.reason}</li>
              ))}
              {status.detail.length > 50 && <li>…and {status.detail.length - 50} more</li>}
            </ul>
          )}
        </div>
      )}

      {/* ===== Export ===== */}
      <SectionTitle>Export</SectionTitle>
      <Card>
        <p className="text-[13px] text-muted mb-3">Download your transactions as a CSV — opens in Excel or Google Sheets.</p>
        <Field label="What to export" className="mb-3">
          <ResponsiveSelect
            title="What to export"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'month', label: `This month (${MONTHS[monthIndex]} ${year})` },
              { value: 'all', label: 'All time' },
              { value: 'range', label: 'Custom date range' },
            ]}
          />
        </Field>
        {scope === 'range' && (
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Field label="From"><DatePicker value={customFrom} onChange={setCustomFrom} max={customTo || undefined} className={inputClass} /></Field>
            <Field label="To"><DatePicker value={customTo} onChange={setCustomTo} min={customFrom || undefined} className={inputClass} /></Field>
          </div>
        )}
        <Button onClick={handleExport} disabled={busy === 'export'} className="w-full">
          <DownloadIcon className="w-[18px] h-[18px]" />
          {busy === 'export' ? 'Preparing…' : `Download CSV (${scopeLabel})`}
        </Button>
      </Card>

      {/* ===== Backup & restore ===== */}
      <SectionTitle>Backup & restore</SectionTitle>
      <Card>
        <p className="text-[13px] text-muted mb-3">
          A full copy of everything — accounts, categories, transactions, rates and settings — in one file. Keep it somewhere safe.
        </p>
        <Button onClick={handleBackup} disabled={busy === 'backup'} className="w-full mb-2.5">
          <DownloadIcon className="w-[18px] h-[18px]" />
          {busy === 'backup' ? 'Preparing…' : 'Download backup (.json)'}
        </Button>
        <Button variant="ghost" onClick={() => restoreInput.current?.click()} disabled={busy === 'restore'} className="w-full">
          <UploadIcon className="w-[18px] h-[18px]" />
          Restore from backup…
        </Button>
        <input ref={restoreInput} type="file" accept="application/json,.json" className="hidden" onChange={onRestoreFile} />
        <p className="text-[11.5px] text-faint mt-2.5 leading-relaxed">
          Restore <strong>merges</strong> into your current data: matching accounts &amp; categories are reused, and the backup’s transactions are added. It never deletes.
        </p>
      </Card>

      {/* ===== Import ===== */}
      <SectionTitle>Import</SectionTitle>
      <Card>
        <p className="text-[13px] text-muted mb-3">
          Add transactions from a Kura CSV (the same format Export produces). Accounts must already exist — rows for unknown accounts are skipped and listed. Import never deletes.
        </p>
        <Button variant="ghost" onClick={() => importInput.current?.click()} disabled={busy === 'import'} className="w-full">
          <UploadIcon className="w-[18px] h-[18px]" />
          Choose CSV file…
        </Button>
        <input ref={importInput} type="file" accept="text/csv,.csv" className="hidden" onChange={onImportFile} />
      </Card>

      {/* ===== Reset ===== */}
      <SectionTitle>Reset</SectionTitle>
      <Card danger>
        <p className="text-[13px] text-muted mb-1">
          Permanently delete data. {txCount != null && <span>You have <strong>{txCount}</strong> transaction{txCount === 1 ? '' : 's'}.</span>}
        </p>
        <p className="text-[12px] text-faint mb-3">Download a backup above before you reset — this can’t be undone.</p>

        <Button variant="ghost" onClick={() => setResetMode('all')} className="w-full mb-2.5">
          Delete all transactions (keep accounts & categories)
        </Button>

        <Field label="Delete one account’s transactions" className="mb-2.5">
          <ResponsiveSelect
            title="Account to clear"
            placeholder="Choose an account…"
            value={resetAccount}
            onChange={setResetAccount}
            options={accountOptions}
          />
        </Field>
        <Button variant="ghost" onClick={() => setResetMode('account')} disabled={!resetAccount} className="w-full mb-2.5">
          Delete this account’s transactions
        </Button>

        <Button variant="danger" onClick={() => setResetMode('full')} className="w-full">
          Reset everything
        </Button>
      </Card>

      {/* ===== Modals ===== */}
      {pendingRestore && (
        <ConfirmDialog
          title="Restore this backup?"
          tone="primary"
          confirmLabel="Restore (merge)"
          busy={busy === 'restore'}
          onClose={() => setPendingRestore(null)}
          onConfirm={confirmRestore}
          message={(() => {
            const s = backupSummary(pendingRestore)
            return `This backup has ${s.transactions} transactions, ${s.accounts} accounts and ${s.categories} categories. They’ll be merged into your current data — matching accounts and categories are reused, transactions are added. Nothing is deleted.`
          })()}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Import transactions?"
          tone="primary"
          confirmLabel={`Import ${pendingImport.length}`}
          busy={busy === 'import'}
          onClose={() => setPendingImport(null)}
          onConfirm={confirmImport}
          message={`Found ${pendingImport.length} row${pendingImport.length === 1 ? '' : 's'}. Transactions will be added to your existing data; rows whose account doesn’t exist will be skipped and listed. Nothing is deleted.`}
        />
      )}

      {resetMode === 'all' && (
        <ConfirmDialog
          title="Delete all transactions?"
          confirmLabel="Delete all"
          busy={busy === 'reset'}
          onClose={closeReset}
          onConfirm={runReset}
          message={`This permanently deletes every transaction${txCount != null ? ` (${txCount})` : ''}. Your accounts, categories and groups are kept. This can’t be undone — make sure you have a backup.`}
        />
      )}

      {resetMode === 'account' && (
        <ConfirmDialog
          title={`Delete ${selectedAccountName}’s transactions?`}
          confirmLabel="Delete"
          busy={busy === 'reset'}
          onClose={closeReset}
          onConfirm={runReset}
          message={`This permanently deletes all transactions for ${selectedAccountName} (including transfers in or out of it). The account itself is kept. This can’t be undone — make sure you have a backup.`}
        />
      )}

      {resetMode === 'full' && (
        <Modal
          title="Reset everything"
          onClose={closeReset}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={closeReset} disabled={busy === 'reset'}>Cancel</Button>
              <Button variant="danger" className="flex-1" onClick={runReset} disabled={!fullReady || busy === 'reset'}>
                {busy === 'reset' ? 'Deleting…' : 'Delete everything'}
              </Button>
            </>
          }
        >
          <p className="text-[14px] text-muted leading-relaxed mb-1">
            This permanently deletes <strong>everything</strong> — all transactions, accounts, categories, groups and exchange rates. This can’t be undone.
          </p>
          <p className="text-[13px] text-faint mb-3">Make sure you’ve downloaded a backup first.</p>
          <Field label="Type RESET to confirm">
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              autoFocus
              autoCapitalize="characters"
            />
          </Field>
        </Modal>
      )}
    </div>
  )
}
