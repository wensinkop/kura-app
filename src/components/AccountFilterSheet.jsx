import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { listGroups, listAccounts } from '../lib/data'
import { useAccountFilter } from '../FilterContext'
import { Modal, Button } from './ui'
import { accountSubtitle } from '../lib/format'

// Bottom-sheet (mobile) / centered card (desktop) to pick which accounts show on
// Home. A local draft is committed on "Apply"; "All accounts" clears the draft
// (empty = no filter). Archived accounts are excluded.
export default function AccountFilterSheet({ onClose }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { accountIds, setAccountIds } = useAccountFilter()
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [draft, setDraft] = useState(() => new Set(accountIds))

  useEffect(() => {
    Promise.all([listGroups(), listAccounts()]).then(([g, a]) => {
      if (!g.error) setGroups(g.data ?? [])
      if (!a.error) setAccounts((a.data ?? []).filter((x) => !x.archived))
    })
  }, [])

  const toggle = (id) =>
    setDraft((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const apply = () => {
    setAccountIds(draft)
    onClose()
  }

  const allSelected = draft.size === 0
  const inGroup = (gid) => accounts.filter((a) => (a.group_id ?? null) === gid)
  const ungrouped = inGroup(null)

  const Row = ({ a }) => {
    const on = draft.has(a.id)
    return (
      <button
        onClick={() => toggle(a.id)}
        role="checkbox"
        aria-checked={on}
        aria-label={a.name}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-2 text-left"
      >
        <span aria-hidden="true"
          className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 text-[11px] font-bold ${
            on ? 'bg-primary border-primary text-on-primary' : 'border-border text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[14.5px] truncate">{a.name}</span>
          <span className="block text-[11px] text-muted truncate">{accountSubtitle(a)}</span>
        </span>
      </button>
    )
  }

  return (
    <Modal
      title={t('filter.title')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={() => setDraft(new Set())} disabled={allSelected}>
            {t('filter.all')}
          </Button>
          <Button className="flex-1" onClick={apply}>
            {t('filter.apply')}
          </Button>
        </>
      }
    >
      <button
        onClick={() => setDraft(new Set())}
        role="checkbox"
        aria-checked={allSelected}
        aria-label={t('filter.all')}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left mb-1 ${
          allSelected ? 'bg-primary-soft' : 'hover:bg-surface-2'
        }`}
      >
        <span aria-hidden="true"
          className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 text-[11px] font-bold ${
            allSelected ? 'bg-primary border-primary text-on-primary' : 'border-border text-transparent'
          }`}
        >
          ✓
        </span>
        <span className="font-semibold text-[14.5px]">{t('filter.all')}</span>
      </button>

      {accounts.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-muted mb-3">{t('filter.empty')}</p>
          <Button variant="ghost" onClick={() => { onClose(); navigate('/settings/accounts') }}>
            {t('filter.addAccount')}
          </Button>
        </div>
      )}

      {groups.map((g) => {
        const list = inGroup(g.id)
        if (list.length === 0) return null
        return (
          <div key={g.id} className="mt-2">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-faint px-3 pt-1 pb-0.5">{g.name}</div>
            {list.map((a) => <Row key={a.id} a={a} />)}
          </div>
        )
      })}

      {ungrouped.length > 0 && (
        <div className="mt-2">
          <div className="text-[10.5px] font-bold uppercase tracking-wide text-faint px-3 pt-1 pb-0.5">{t('filter.ungrouped')}</div>
          {ungrouped.map((a) => <Row key={a.id} a={a} />)}
        </div>
      )}
    </Modal>
  )
}
