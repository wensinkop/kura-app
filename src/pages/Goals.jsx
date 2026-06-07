import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../AuthContext'
import {
  listGoals, listAccounts, getAccountBalances,
  createGoal, updateGoal, deleteGoal, addToGoal,
} from '../lib/data'
import { goalProgress, goalPacing, presetEmoji, GOAL_PRESETS } from '../lib/goals'
import { formatMoney } from '../lib/format'
import { currencyOptions, localeFor, currencyDecimals } from '../lib/currencies'
import { Button, Field, TextInput, Modal, ConfirmDialog } from '../components/ui'
import ResponsiveSelect from '../components/ResponsiveSelect'
import NumberInput from '../components/NumberInput'
import DatePicker from '../components/DatePicker'
import { PlusIcon, PencilIcon, TrashIcon } from '../lib/icons'

const CURRENCY_OPTS = currencyOptions()
const todayISO = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }

export default function Goals() {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const base = profile?.base_currency ?? 'IDR'

  const [goals, setGoals] = useState([])
  const [accounts, setAccounts] = useState([])
  const [balances, setBalances] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState(null) // { mode:'create'|'edit', goal? }
  const [contribute, setContribute] = useState(null) // goal being funded
  const [confirmDel, setConfirmDel] = useState(null) // goal to delete

  async function reload() {
    const [g, a, b] = await Promise.all([listGoals(), listAccounts(), getAccountBalances()])
    if (!g.error) setGoals(g.data ?? [])
    if (!a.error) setAccounts(a.data ?? [])
    if (!b.error) setBalances(new Map((b.data ?? []).map((x) => [x.account_id, Number(x.balance)])))
    setLoading(false)
  }
  // Deferred so setState isn't called synchronously in the effect body.
  useEffect(() => { const id = setTimeout(() => reload(), 0); return () => clearTimeout(id) }, [])

  const acctMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const savedFor = (goal) => balances.get(goal.account_id) ?? 0
  const currencyFor = (goal) => acctMap.get(goal.account_id)?.currency ?? base

  if (loading) return <p className="text-muted text-sm py-8 text-center">{t('common.loading')}</p>

  return (
    <div className="max-w-[760px] mx-auto">
      <div className="flex justify-end mb-3">
        <Button onClick={() => setForm({ mode: 'create' })}>
          <PlusIcon className="w-[18px] h-[18px]" /> {t('goals.addGoal')}
        </Button>
      </div>

      {goals.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-8 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-sm text-muted">{t('goals.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {goals.map((goal) => (
            <GoalCard key={goal.id} t={t} goal={goal} saved={savedFor(goal)} currency={currencyFor(goal)}
              onAdd={() => setContribute(goal)} onEdit={() => setForm({ mode: 'edit', goal })} onDelete={() => setConfirmDel(goal)} />
          ))}
        </div>
      )}

      {form && (
        <GoalForm t={t} mode={form.mode} goal={form.goal} base={base} accounts={accounts}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); reload() }}
          userId={user.id} />
      )}

      {contribute && (
        <ContributeSheet t={t} goal={contribute} currency={currencyFor(contribute)} saved={savedFor(contribute)}
          accounts={accounts} userId={user.id}
          onClose={() => setContribute(null)}
          onSaved={() => { setContribute(null); reload() }} />
      )}

      {confirmDel && (
        <ConfirmDialog
          title={t('goals.deleteTitle')}
          message={t('goals.deleteMessage')}
          confirmLabel={t('common.delete')}
          onConfirm={async () => { await deleteGoal(confirmDel.id); setConfirmDel(null); reload() }}
          onClose={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}

function Ring({ pct, reached, size = 60, stroke = 6 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, pct) / 100)
  const color = reached ? 'var(--income)' : 'var(--primary)'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .4s' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[13px] font-extrabold tabular">{pct}%</span>
    </div>
  )
}

function GoalCard({ t, goal, saved, currency, onAdd, onEdit, onDelete }) {
  const prog = goalProgress(saved, Number(goal.target_amount))
  const pace = goalPacing(saved, Number(goal.target_amount), goal.deadline)
  return (
    <div className="bg-surface border border-border rounded-[14px] p-4">
      <div className="flex items-center gap-3.5">
        <Ring pct={prog.pct} reached={prog.reached} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0">{presetEmoji(goal.preset)}</span>
            <span className="font-bold text-[15px] truncate">{goal.name}</span>
          </div>
          <div className="text-[13px] text-muted tabular mt-0.5">
            <span className="font-semibold text-text">{formatMoney(saved, currency)}</span> {t('goals.of')} {formatMoney(Number(goal.target_amount), currency)}
          </div>
          <div className="text-[11.5px] mt-1">
            {prog.reached ? (
              <span className="text-income font-semibold">
                {prog.over ? t('goals.over', { amount: formatMoney(saved - Number(goal.target_amount), currency) }) : t('goals.reached')}
              </span>
            ) : pace ? (
              <span className={pace.overdue ? 'text-expense' : 'text-muted'}>
                {pace.overdue
                  ? t('goals.overdue', { amount: formatMoney(pace.remaining, currency) })
                  : t('goals.perMonth', { amount: formatMoney(pace.perMonth, currency) })}
              </span>
            ) : (
              <span className="text-muted">{t('goals.remaining', { amount: formatMoney(Math.max(0, Number(goal.target_amount) - saved), currency) })}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Button className="flex-1" onClick={onAdd}><PlusIcon className="w-4 h-4" /> {t('goals.addTo')}</Button>
        <button onClick={onEdit} aria-label={t('goals.editGoal')} className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2"><PencilIcon className="w-[17px] h-[17px]" /></button>
        <button onClick={onDelete} aria-label={t('common.delete')} className="w-9 h-9 grid place-items-center rounded-[10px] text-expense hover:bg-surface-2"><TrashIcon className="w-[17px] h-[17px]" /></button>
      </div>
    </div>
  )
}

function GoalForm({ t, mode, goal, base, accounts, onClose, onSaved, userId }) {
  const isEdit = mode === 'edit'
  const [name, setName] = useState(goal?.name ?? '')
  const [nameTouched, setNameTouched] = useState(isEdit)
  const [preset, setPreset] = useState(goal?.preset ?? 'custom')
  const [target, setTarget] = useState(goal ? Number(goal.target_amount) : null)
  const [currency, setCurrency] = useState(goal ? (accounts.find((a) => a.id === goal.account_id)?.currency ?? base) : base)
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  function choosePreset(k) {
    setPreset(k)
    if (!nameTouched && k !== 'custom') setName(t(`goals.preset.${k}`))
  }

  const canSave = name.trim().length > 0 && Number(target) > 0 && !busy

  async function save() {
    if (!canSave) return
    setBusy(true); setErr('')
    if (isEdit) {
      const { error } = await updateGoal(goal.id, { name: name.trim(), target_amount: Number(target), deadline: deadline || null, preset })
      setBusy(false)
      if (error) { setErr(t('goals.saveFailed')); return }
    } else {
      const { error } = await createGoal(userId, { name: name.trim(), target_amount: Number(target), deadline: deadline || null, preset, currency })
      setBusy(false)
      if (error) { setErr(t('goals.saveFailed')); return }
    }
    onSaved()
  }

  return (
    <Modal
      title={isEdit ? t('goals.editGoal') : t('goals.newGoal')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button className="flex-1" onClick={save} disabled={!canSave}>{busy ? t('common.working') : t('common.save')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div>
          <span className="text-[11px] font-semibold text-muted pl-0.5">{t('goals.presetLabel')}</span>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {GOAL_PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => choosePreset(p.key)}
                className={`py-2 rounded-xl border text-[12.5px] font-bold flex flex-col items-center gap-0.5 transition-colors ${
                  preset === p.key ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:bg-surface-2'
                }`}>
                <span className="text-base">{p.emoji}</span>{t(`goals.preset.${p.key}`)}
              </button>
            ))}
          </div>
        </div>

        <Field label={t('goals.name')}>
          <TextInput value={name} onChange={(e) => { setNameTouched(true); setName(e.target.value) }} placeholder={t('goals.namePlaceholder')} maxLength={60} />
        </Field>

        <Field label={t('goals.target')}>
          <NumberInput value={target} onChange={setTarget} locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
        </Field>

        {/* Currency is fixed once the goal's account exists. Plain div, not Field
            (a label would route clicks to the picker). */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-muted pl-0.5">{t('goals.currency')}</span>
          {isEdit
            ? <TextInput value={currency} disabled />
            : <ResponsiveSelect title={t('goals.currency')} value={currency} onChange={setCurrency} options={CURRENCY_OPTS} />}
        </div>

        <Field label={t('goals.deadline')}>
          <DatePicker value={deadline} onChange={setDeadline} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
        </Field>

        {err && <p role="alert" className="text-sm text-expense">{err}</p>}
      </div>
    </Modal>
  )
}

function ContributeSheet({ t, goal, currency, saved, accounts, userId, onClose, onSaved }) {
  // Funding accounts: active, same currency, not the goal's own account.
  const funding = accounts.filter((a) => !a.archived && a.currency === currency && a.id !== goal.account_id)
  const [fromId, setFromId] = useState(funding[0]?.id ?? '')
  const [amount, setAmount] = useState(null)
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const canSave = fromId && Number(amount) > 0 && date && !busy

  async function save() {
    if (!canSave) return
    setBusy(true); setErr('')
    const { error } = await addToGoal(userId, { fromAccountId: fromId, goalAccountId: goal.account_id, amount: Number(amount), date })
    if (error) { setBusy(false); setErr(t('goals.saveFailed')); return }
    // Mark reached once the target is crossed (display also derives from balance).
    if (goal.status !== 'reached' && saved + Number(amount) >= Number(goal.target_amount)) {
      await updateGoal(goal.id, { status: 'reached' })
    }
    setBusy(false)
    onSaved()
  }

  return (
    <Modal
      title={t('goals.contribute', { name: goal.name })}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button className="flex-1" onClick={save} disabled={!canSave}>{busy ? t('common.working') : t('goals.addTo')}</Button>
        </>
      }
    >
      {funding.length === 0 ? (
        <p className="text-sm text-muted">{t('goals.noFunding', { currency })}</p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-muted pl-0.5">{t('goals.fromAccount')}</span>
            <ResponsiveSelect title={t('goals.fromAccount')} value={fromId} onChange={setFromId}
              options={funding.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
          <Field label={t('goals.amount')}>
            <NumberInput value={amount} onChange={setAmount} locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
          </Field>
          <Field label={t('goals.date')}>
            <DatePicker value={date} onChange={setDate} className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[15px] text-text focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft" />
          </Field>
          {err && <p role="alert" className="text-sm text-expense">{err}</p>}
        </div>
      )}
    </Modal>
  )
}
