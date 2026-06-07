import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import {
  getTransaction, listAccounts, listGroups, listCategories, recentNotes,
  updateTransaction, deleteTransaction, createCategory,
} from '../lib/data'
import { localeFor, currencyDecimals } from '../lib/currencies'
import { formatMoney } from '../lib/format'
import NumberInput from '../components/NumberInput'
import AutocompleteInput from '../components/AutocompleteInput'
import DatePicker from '../components/DatePicker'
import ResponsiveSelect from '../components/ResponsiveSelect'
import Sidebar from '../components/Sidebar'
import { Button, ConfirmDialog, inputClass } from '../components/ui'
import { ChevronLeft, TrashIcon } from '../lib/icons'

export default function EditTransaction() {
  const { t } = useTranslation()
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const KIND_OPTIONS = [
    { value: 'expense', label: t('tx.kind.expense') },
    { value: 'income', label: t('tx.kind.income') },
    { value: 'transfer', label: t('tx.kind.transfer') },
  ]

  const [tx, setTx] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [categories, setCategories] = useState([])
  const [notes, setNotes] = useState([])
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  useEffect(() => {
    Promise.all([getTransaction(id), listAccounts(), listGroups(), listCategories(), recentNotes()]).then(
      ([t, a, g, c, n]) => {
        if (t.error || !t.data) { setNotFound(true); setLoading(false); return }
        const tr = t.data
        setTx(tr)
        setAccounts(a.data ?? [])
        setGroups(g.data ?? [])
        setCategories(c.data ?? [])
        setNotes(n ?? [])
        let categoryId = '', subId = ''
        if (tr.category) {
          if (tr.category.parent_id) { subId = tr.category.id; categoryId = tr.category.parent_id }
          else categoryId = tr.category.id
        }
        setForm({
          kind: tr.kind,
          date: tr.date,
          amount: Number(tr.amount),
          accountId: tr.account_id,
          categoryId, subId,
          toAccountId: tr.to_account_id ?? '',
          toAmount: tr.to_amount != null ? Number(tr.to_amount) : null,
          note: tr.note ?? '',
        })
        setLoading(false)
      }
    )
  }, [id])

  const accountOptions = useMemo(() => {
    const gName = new Map(groups.map((g) => [g.id, g.name]))
    const gSort = new Map(groups.map((g) => [g.id, g.sort_order]))
    return [...accounts]
      .sort((a, b) => {
        const ga = a.group_id ? gSort.get(a.group_id) ?? 0 : Infinity
        const gb = b.group_id ? gSort.get(b.group_id) ?? 0 : Infinity
        if (ga !== gb) return ga - gb
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      .map((a) => ({ value: a.id, label: `${a.name} · ${a.currency}`, group: a.group_id ? gName.get(a.group_id) ?? 'Group' : 'Ungrouped' }))
  }, [accounts, groups])

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const kind = form?.kind
  const topCats = useMemo(() => categories.filter((c) => c.kind === kind && !c.parent_id), [categories, kind])
  const subsFor = (catId) => categories.filter((c) => c.parent_id === catId)

  function set(patch) { setForm((f) => ({ ...f, ...patch })) }
  // Changing the type clears category/sub (they're kind-specific).
  function setKind(k) { set({ kind: k, categoryId: '', subId: '' }) }

  if (loading) return <Shell title={t('tx.editTitle')}><p className="text-muted text-sm py-8 text-center">{t('common.loading')}</p></Shell>
  if (notFound) return (
    <Shell title={t('tx.editTitle')} onBack={() => navigate('/')}>
      <p className="text-muted text-sm py-8 text-center">{t('tx.notFound')}</p>
    </Shell>
  )

  const fromCur = accountById.get(form.accountId)?.currency ?? tx.currency
  const toCur = accountById.get(form.toAccountId)?.currency
  const cross = kind === 'transfer' && toCur && fromCur !== toCur
  const subs = form.categoryId ? subsFor(form.categoryId) : []

  // Inline category creation from the picker (mirrors the entry screen).
  async function createCat(name) {
    const sortOrder = categories.filter((c) => c.kind === kind && !c.parent_id).length
    const { data, error } = await createCategory(user.id, { kind, name, parent_id: null }, sortOrder)
    if (error || !data) { setError(error?.message || t('tx.errCreateCat')); return null }
    setCategories((prev) => [...prev, data])
    return data.id
  }

  function validate() {
    if (!form.date) return t('tx.errDate')
    if (!form.amount || form.amount <= 0) return t('tx.errAmount')
    if (kind === 'transfer') {
      if (!form.accountId || !form.toAccountId) return t('tx.errBothAccounts')
      if (form.accountId === form.toAccountId) return t('tx.errSameAccount')
      if (cross && (!form.toAmount || form.toAmount <= 0)) return t('tx.errReceived')
    } else if (!form.accountId) return t('tx.errAccount')
    return ''
  }

  async function save() {
    const err = validate()
    if (err) { setError(err); return }
    setBusy(true)
    const payload = kind === 'transfer'
      ? {
          kind: 'transfer',
          date: form.date, amount: form.amount, account_id: form.accountId,
          to_account_id: form.toAccountId, to_amount: cross ? form.toAmount : form.amount,
          exchange_rate: cross && form.toAmount ? form.amount / form.toAmount : null,
          category_id: null, note: form.note.trim() || null,
        }
      : {
          kind, // income | expense
          date: form.date, amount: form.amount, account_id: form.accountId,
          category_id: form.subId || form.categoryId || null, note: form.note.trim() || null,
          // clear any transfer fields if this used to be a transfer
          to_account_id: null, to_amount: null, exchange_rate: null,
        }
    const { error: e } = await updateTransaction(id, payload)
    if (e) { setError(t('tx.saveFailed')); setBusy(false); return }
    // Return to wherever this was opened from (Home, an account ledger, search,
    // or the Stats category drill) rather than always jumping Home.
    navigate(-1)
  }

  async function doDelete() {
    setBusy(true)
    await deleteTransaction(id)
    navigate(-1)
  }

  return (
    <Shell onBack={() => navigate(-1)} title={t('tx.editTitle')}>
      <div className="max-w-[560px] mx-auto">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('tx.type')} full>
            <ResponsiveSelect title={t('tx.type')} value={kind} onChange={setKind} options={KIND_OPTIONS} />
          </Field>
          <Field label={t('tx.date')}>
            <DatePicker value={form.date} onChange={(v) => set({ date: v })} className={inputClass} />
          </Field>
          <Field label={cross ? t('tx.amountSent') : t('tx.amount')}>
            <NumberInput value={form.amount} onChange={(v) => set({ amount: v })}
              locale={localeFor(fromCur)} currency={fromCur} decimals={currencyDecimals(fromCur)} placeholder="0" />
          </Field>

          {kind === 'transfer' ? (
            <>
              <Field label={t('tx.fromAccount')} full>
                <ResponsiveSelect title={t('tx.fromAccount')} placeholder={t('tx.fromAccount')} value={form.accountId}
                  onChange={(v) => set({ accountId: v })} options={accountOptions} />
              </Field>
              <Field label={t('tx.toAccount')} full>
                <ResponsiveSelect title={t('tx.toAccount')} placeholder={t('tx.toAccount')} value={form.toAccountId}
                  onChange={(v) => set({ toAccountId: v })} options={accountOptions} />
              </Field>
              {cross && (
                <Field label={t('tx.received', { cur: toCur })} full>
                  <NumberInput value={form.toAmount} onChange={(v) => set({ toAmount: v })}
                    locale={localeFor(toCur)} currency={toCur} decimals={currencyDecimals(toCur)} placeholder="0" />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label={t('tx.category')} full={subs.length === 0}>
                <ResponsiveSelect title={t('tx.category')} placeholder={t('tx.categoryPlaceholder')} value={form.categoryId}
                  onChange={(v) => set({ categoryId: v, subId: '' })}
                  options={topCats.map((c) => ({ value: c.id, label: c.name }))}
                  onCreate={createCat} />
              </Field>
              {subs.length > 0 && (
                <Field label={t('tx.subcategory')}>
                  <ResponsiveSelect title={t('tx.subcategory')} placeholder={t('common.none')} noneLabel={t('common.none')} value={form.subId}
                    onChange={(v) => set({ subId: v })} options={subs.map((s) => ({ value: s.id, label: s.name }))} />
                </Field>
              )}
              <Field label={t('tx.account')} full>
                <ResponsiveSelect title={t('tx.account')} placeholder={t('tx.choose')} value={form.accountId}
                  onChange={(v) => set({ accountId: v })} options={accountOptions} />
              </Field>
            </>
          )}

          <Field label={t('tx.note')} full>
            <AutocompleteInput value={form.note} onChange={(v) => set({ note: v })}
              suggestions={notes} placeholder={t('tx.notePlaceholder')} className={inputClass} />
          </Field>
        </div>

        {cross && form.amount > 0 && form.toAmount > 0 && (
          <div className="text-[11px] text-faint mt-2 px-0.5">{t('tx.rate', { cur: toCur, amount: formatMoney(form.amount / form.toAmount, fromCur) })}</div>
        )}

        {error && <p className="text-sm text-expense mt-3">{error}</p>}

        <div className="flex gap-2.5 mt-5">
          <Button variant="ghost" onClick={() => setConfirmDel(true)} disabled={busy}>
            <TrashIcon className="w-[17px] h-[17px] text-expense" /> {t('common.delete')}
          </Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? t('tx.saving') : t('tx.saveChanges')}</Button>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title={t('tx.deleteTxTitle')}
          message={t('tx.deleteTxMessage')}
          confirmLabel={t('common.delete')}
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </Shell>
  )
}

function Shell({ title, onBack, children }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 pt-[calc(0.75rem_+_env(safe-area-inset-top))] pb-3 flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} aria-label={t('common.back')} className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
              <ChevronLeft />
            </button>
          )}
          <div className="font-bold text-[17px]">{title}</div>
        </header>
        <main className="flex-1 px-4 py-4 desk:px-8 w-full desk:max-w-[1100px] desk:mx-auto">{children}</main>
      </div>
    </div>
  )
}

function Field({ label, full, children }) {
  return (
    <div className={`flex flex-col gap-1.5 ${full ? 'col-span-2' : ''}`}>
      <label className="text-[11px] font-semibold text-muted pl-0.5">{label}</label>
      {children}
    </div>
  )
}
