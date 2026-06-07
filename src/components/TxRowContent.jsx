// The inner 2-line content of a transaction row (note + amount; category chip
// + sub + account). Shared by Home, Search results, and the Stats drilldown so
// they stay visually identical. The pressable wrapper (tap / long-press /
// selection checkbox) lives at each call site.

import { useTranslation } from 'react-i18next'
import { formatMoney } from '../lib/format'

const KIND_COLOR = { income: 'text-income', expense: 'text-expense', transfer: 'text-transfer' }

// Resolve the chip (top-level category name) + sub (sub-category name) for a tx.
// `tr` is the i18n translator (the component's own `t` prop is the transaction).
function catLabels(tx, catMap, tr) {
  const c = tx.category
  if (!c) return { chip: tr('common.uncategorised'), sub: null }
  if (c.parent_id) return { chip: catMap.get(c.parent_id)?.name ?? '…', sub: c.name }
  return { chip: c.name, sub: null }
}

// Bold the first case-insensitive occurrence of `q` within `text` (search hit).
function Highlighted({ text, q }) {
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <b className="text-primary font-extrabold">{text.slice(i, i + q.length)}</b>
      {text.slice(i + q.length)}
    </>
  )
}

export default function TxRowContent({ t, catMap, highlight, hideAccount }) {
  const { t: tr } = useTranslation()
  const isTransfer = t.kind === 'transfer'
  const { chip, sub } = isTransfer
    ? { chip: tr('tx.kind.transfer'), sub: `${t.account?.name ?? '?'} → ${t.to_account?.name ?? '?'}` }
    : catLabels(t, catMap, tr)

  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between gap-3 items-baseline">
        <span className="font-semibold text-[14.5px] leading-tight truncate min-w-0">
          {t.note ? <Highlighted text={t.note} q={highlight} /> : chip}
        </span>
        <span className={`font-bold text-[14.5px] tabular whitespace-nowrap ${KIND_COLOR[t.kind]}`}>
          {formatMoney(t.amount, t.currency)}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${
          isTransfer ? 'bg-transfer/10 text-transfer border-transfer/30' : 'bg-surface-2 text-muted border-border'
        }`}>{chip}</span>
        {sub && <span className="text-xs text-muted truncate">{sub}</span>}
        {!isTransfer && !hideAccount && <span className="text-xs text-faint ml-auto whitespace-nowrap shrink-0">{t.account?.name}</span>}
      </div>
    </div>
  )
}
