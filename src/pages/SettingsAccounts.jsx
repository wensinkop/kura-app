import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../AuthContext'
import {
  listGroups, createGroup, renameGroup, deleteGroup,
  listAccounts, createAccount, updateAccount, deleteAccount,
  setAccountArchived, persistOrder,
} from '../lib/data'
import { currencyOptions, localeFor, currencyDecimals } from '../lib/currencies'
import { TYPE_OPTIONS, accountSubtitle } from '../lib/format'
import SearchableSelect from '../components/SearchableSelect'
import NumberInput from '../components/NumberInput'
import Sidebar from '../components/Sidebar'
import { Button, Field, TextInput, Segmented, IconButton, Modal, ConfirmDialog, inputClass } from '../components/ui'
import { PlusIcon, PencilIcon, TrashIcon, ArchiveIcon, ChevronUp, ChevronDown, ChevronLeft } from '../lib/icons'

const CURRENCY_OPTS = currencyOptions()

export default function SettingsAccounts() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [acctForm, setAcctForm] = useState(null) // { mode, target? }
  const [groupForm, setGroupForm] = useState(null) // { mode, target? }
  const [confirm, setConfirm] = useState(null) // { kind:'account'|'group', item }
  const [deleteError, setDeleteError] = useState(null) // message shown when a delete is blocked
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [g, a] = await Promise.all([listGroups(), listAccounts()])
    if (!g.error) setGroups(g.data ?? [])
    if (!a.error) setAccounts(a.data ?? [])
    setLoading(false)
  }

  // Initial load — inline so setState lands in an async callback.
  useEffect(() => {
    Promise.all([listGroups(), listAccounts()]).then(([g, a]) => {
      if (!g.error) setGroups(g.data ?? [])
      if (!a.error) setAccounts(a.data ?? [])
      setLoading(false)
    })
  }, [])

  const visibleAccounts = accounts.filter((a) => showArchived || !a.archived)
  const inGroup = (gid) => visibleAccounts.filter((a) => (a.group_id ?? null) === gid)
  const archivedCount = accounts.filter((a) => a.archived).length
  const groupOptions = [{ value: '', label: 'No group' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]

  async function moveAccounts(list, index, dir) {
    const next = index + dir
    if (next < 0 || next >= list.length) return
    const reordered = [...list]
    ;[reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    await persistOrder('accounts', reordered.map((a) => a.id))
    reload()
  }

  async function moveGroups(index, dir) {
    const next = index + dir
    if (next < 0 || next >= groups.length) return
    const reordered = [...groups]
    ;[reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    await persistOrder('account_groups', reordered.map((g) => g.id))
    reload()
  }

  async function submitAccount(payload) {
    setBusy(true)
    if (acctForm.mode === 'edit') {
      await updateAccount(acctForm.target.id, payload)
    } else {
      const count = accounts.filter((a) => (a.group_id ?? null) === (payload.group_id || null)).length
      await createAccount(user.id, payload, count)
    }
    setBusy(false)
    setAcctForm(null)
    reload()
  }

  async function submitGroup(name) {
    setBusy(true)
    if (groupForm.mode === 'edit') {
      await renameGroup(groupForm.target.id, name)
    } else {
      await createGroup(user.id, name, groups.length)
    }
    setBusy(false)
    setGroupForm(null)
    reload()
  }

  async function doDelete() {
    setBusy(true)
    const res =
      confirm.kind === 'account' ? await deleteAccount(confirm.item.id) : await deleteGroup(confirm.item.id)
    setBusy(false)
    if (res?.error) {
      // Usually the FK RESTRICT: the account still has transactions, so the DB
      // refuses to delete it (history is never silently lost). Explain, don't
      // fail quietly.
      setDeleteError(
        confirm.kind === 'account'
          ? `“${confirm.item.name}” still has transactions, so it can’t be deleted — your history is protected. Archive it instead to hide it while keeping its records, or remove its transactions first (Settings → Backup & data → “Delete one account’s transactions”).`
          : 'That couldn’t be deleted. Please try again.'
      )
      return
    }
    setConfirm(null)
    reload()
  }

  function closeDeleteDialogs() {
    setConfirm(null)
    setDeleteError(null)
  }

  async function toggleArchive(a) {
    await setAccountArchived(a.id, !a.archived)
    reload()
  }

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  const ungrouped = inGroup(null)
  const hasNothing = accounts.length === 0 && groups.length === 0

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="flex gap-2.5 mb-4">
        <Button className="flex-1" onClick={() => setAcctForm({ mode: 'create' })}>
          <PlusIcon className="w-[18px] h-[18px]" /> Add account
        </Button>
        <Button variant="ghost" onClick={() => setGroupForm({ mode: 'create' })}>
          <PlusIcon className="w-[18px] h-[18px]" /> Group
        </Button>
      </div>

      {hasNothing && (
        <div className="bg-surface border border-border rounded-[14px] p-6 text-center text-sm text-muted">
          No accounts yet. Add a cash, debit, or credit-card account to get started.
          Groups are optional folders to organise them.
        </div>
      )}

      {/* Grouped accounts */}
      {groups.map((g, gi) => (
        <GroupBlock key={g.id} title={g.name}
          headerRight={
            <div className="flex items-center gap-0.5">
              <IconButton label="Move group up" onClick={() => moveGroups(gi, -1)} disabled={gi === 0}><ChevronUp className="w-4 h-4" /></IconButton>
              <IconButton label="Move group down" onClick={() => moveGroups(gi, 1)} disabled={gi === groups.length - 1}><ChevronDown className="w-4 h-4" /></IconButton>
              <IconButton label="Rename group" onClick={() => setGroupForm({ mode: 'edit', target: g })}><PencilIcon className="w-4 h-4" /></IconButton>
              <IconButton label="Delete group" danger onClick={() => setConfirm({ kind: 'group', item: g })}><TrashIcon className="w-4 h-4" /></IconButton>
            </div>
          }
        >
          {inGroup(g.id).length === 0 ? (
            <EmptyRow>No accounts in this group</EmptyRow>
          ) : (
            inGroup(g.id).map((a, i, arr) => (
              <AccountRow key={a.id} a={a} isFirst={i === 0} isLast={i === arr.length - 1}
                onUp={() => moveAccounts(arr, i, -1)} onDown={() => moveAccounts(arr, i, 1)}
                onEdit={() => setAcctForm({ mode: 'edit', target: a })}
                onArchive={() => toggleArchive(a)} onDelete={() => setConfirm({ kind: 'account', item: a })} />
            ))
          )}
        </GroupBlock>
      ))}

      {/* Ungrouped accounts */}
      {ungrouped.length > 0 && (
        <GroupBlock title={groups.length > 0 ? 'Ungrouped' : 'Accounts'}>
          {ungrouped.map((a, i, arr) => (
            <AccountRow key={a.id} a={a} isFirst={i === 0} isLast={i === arr.length - 1}
              onUp={() => moveAccounts(arr, i, -1)} onDown={() => moveAccounts(arr, i, 1)}
              onEdit={() => setAcctForm({ mode: 'edit', target: a })}
              onArchive={() => toggleArchive(a)} onDelete={() => setConfirm({ kind: 'account', item: a })} />
          ))}
        </GroupBlock>
      )}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((s) => !s)} className="text-xs font-semibold text-faint hover:text-muted mt-4 px-1">
          {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
        </button>
      )}

      {acctForm && (
        <AccountForm mode={acctForm.mode} target={acctForm.target} groupOptions={groupOptions}
          busy={busy} onSubmit={submitAccount} onClose={() => setAcctForm(null)} />
      )}

      {groupForm && (
        <GroupForm mode={groupForm.mode} initial={groupForm.target?.name ?? ''}
          busy={busy} onSubmit={submitGroup} onClose={() => setGroupForm(null)} />
      )}

      {confirm && !deleteError && (
        <ConfirmDialog
          title={`Delete "${confirm.item.name}"?`}
          message={
            confirm.kind === 'group'
              ? 'The group is removed; its accounts are kept and become ungrouped.'
              : 'This account is permanently removed. If it has transactions, deleting is blocked to protect your history — archive it instead to hide it while keeping its records.'
          }
          confirmLabel="Delete"
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setConfirm(null)}
        />
      )}

      {deleteError && (
        <ConfirmDialog
          title="Can’t delete account"
          message={deleteError}
          confirmLabel="OK"
          tone="primary"
          onConfirm={closeDeleteDialogs}
          onClose={closeDeleteDialogs}
        />
      )}
    </div>
  )
}

function GroupBlock({ title, headerRight, children }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden mt-3">
      <div className="flex items-center gap-2 px-3.5 py-2 bg-surface-2 min-h-[42px]">
        <span className="text-xs font-bold uppercase tracking-wide text-faint flex-1 truncate">{title}</span>
        {headerRight}
      </div>
      {children}
    </div>
  )
}

function EmptyRow({ children }) {
  return <div className="px-3.5 py-3 text-xs text-faint italic">{children}</div>
}

function AccountRow({ a, isFirst, isLast, onUp, onDown, onEdit, onArchive, onDelete }) {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5 border-t border-border">
      <div className="flex flex-col -ml-1 mr-0.5">
        <IconButton label="Move up" onClick={onUp} disabled={isFirst}><ChevronUp className="w-4 h-4" /></IconButton>
        <IconButton label="Move down" onClick={onDown} disabled={isLast}><ChevronDown className="w-4 h-4" /></IconButton>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-[14.5px] truncate ${a.archived ? 'text-faint line-through' : 'text-text'}`}>{a.name}</div>
        <div className="text-xs text-muted mt-0.5 truncate">{accountSubtitle(a)}{a.archived ? ' · Archived' : ''}</div>
      </div>
      <IconButton label="Edit" onClick={onEdit}><PencilIcon className="w-[16px] h-[16px]" /></IconButton>
      <IconButton label={a.archived ? 'Unarchive' : 'Archive'} onClick={onArchive}><ArchiveIcon className="w-[16px] h-[16px]" /></IconButton>
      <IconButton label="Delete" danger onClick={onDelete}><TrashIcon className="w-[16px] h-[16px]" /></IconButton>
    </div>
  )
}

// Full-screen page (not a modal) for creating/editing an account. The Cancel/Save
// bar sits in the normal scroll flow — not pinned — so it never overlaps the
// fields, and on mobile the focused field lifts above the on-screen keyboard
// (same keyboard-aware pattern as the New-transaction screen).
const DESK = 768 // --breakpoint-desk

function AccountForm({ mode, target, groupOptions, busy, onSubmit, onClose }) {
  const isEdit = mode === 'edit'
  const [name, setName] = useState(target?.name ?? '')
  const [type, setType] = useState(target?.type ?? 'cash')
  const [currency, setCurrency] = useState(target?.currency ?? 'IDR')
  const [groupId, setGroupId] = useState(target?.group_id ?? '')
  const [opening, setOpening] = useState(target?.opening_balance != null ? Number(target.opening_balance) : null)
  const [settlement, setSettlement] = useState(target?.settlement_day?.toString() ?? '')
  const [payment, setPayment] = useState(target?.payment_day?.toString() ?? '')

  const isCC = type === 'credit_card'
  const dayValid = (v) => v === '' || (Number(v) >= 1 && Number(v) <= 31)
  const canSave =
    name.trim().length > 0 && currency && !busy && dayValid(settlement) && dayValid(payment)

  function submit() {
    if (!canSave) return
    onSubmit({
      name, type, currency,
      group_id: groupId || null,
      opening_balance: opening ?? 0,
      settlement_day: settlement,
      payment_day: payment,
    })
  }

  // ---- Keyboard-aware scrolling (mobile) -------------------------------------
  const scrollRef = useRef(null)

  // Scroll the page so the focused field sits just below the header, clearing
  // the keyboard. The trailing spacer gives even the last field room to rise.
  const liftField = useCallback((el) => {
    const sc = scrollRef.current
    if (!el || !sc) return
    const y = sc.scrollTop + (el.getBoundingClientRect().top - sc.getBoundingClientRect().top) - 12
    sc.scrollTo({ top: Math.max(0, y), behavior: 'auto' })
  }, [])

  function handleFocus(e) {
    if (window.innerWidth >= DESK) return
    const fieldEl = e.target.closest('label') ?? e.target
    requestAnimationFrame(() => liftField(fieldEl))
  }

  // The keyboard opens a beat after focus (the viewport resizes) — re-apply then.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      if (window.innerWidth >= DESK) return
      const el = document.activeElement
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return
      liftField(el.closest('label') ?? el)
    }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [liftField])

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 pt-[calc(0.625rem_+_env(safe-area-inset-top))] pb-2.5 flex items-center gap-2">
          <button onClick={onClose} aria-label="Back"
            className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px]">{isEdit ? 'Edit account' : 'New account'}</div>
        </header>

        <div ref={scrollRef} onFocusCapture={handleFocus} className="flex-1 overflow-y-auto px-4 py-4 desk:px-8 desk:py-6">
          <div className="max-w-[560px] mx-auto flex flex-col gap-3.5">
            <Field label="Name">
              <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. BCA — Main Savings" maxLength={60} />
            </Field>

            <Field label="Type">
              <Segmented value={type} onChange={setType} options={TYPE_OPTIONS} />
            </Field>

            <Field
              label="Currency"
              hint={isEdit ? 'Currency is fixed once an account is created and can’t be changed.' : 'Fixed once created — choose carefully.'}
            >
              {isEdit ? (
                <TextInput value={currency} disabled />
              ) : (
                <SearchableSelect value={currency} onChange={setCurrency} options={CURRENCY_OPTS} className={inputClass} placeholder="Search currency…" />
              )}
            </Field>

            <Field label="Group">
              <SearchableSelect value={groupId} onChange={setGroupId} options={groupOptions} className={inputClass} placeholder="No group" />
            </Field>

            <Field
              label="Opening balance"
              hint={isCC ? 'What you currently owe — enter as a negative number.' : 'Current amount in this account before logged transactions.'}
            >
              <NumberInput value={opening} onChange={setOpening} allowNegative
                locale={localeFor(currency)} currency={currency} decimals={currencyDecimals(currency)} placeholder="0" />
            </Field>

            {isCC && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Settlement day" hint="1–31">
                  <TextInput type="number" min={1} max={31} inputMode="numeric" value={settlement}
                    onChange={(e) => setSettlement(e.target.value)} placeholder="e.g. 18" />
                </Field>
                <Field label="Payment due day" hint="1–31">
                  <TextInput type="number" min={1} max={31} inputMode="numeric" value={payment}
                    onChange={(e) => setPayment(e.target.value)} placeholder="e.g. 5" />
                </Field>
              </div>
            )}

            {/* Cancel/Save in the normal flow (not pinned) so they never cover fields. */}
            <div className="flex gap-2.5 mt-2">
              <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button className="flex-1" onClick={submit} disabled={!canSave}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>

            {/* Lets the last field scroll up clear of the keyboard. */}
            <div aria-hidden="true" className="h-[42dvh]" />
          </div>
        </div>
      </div>
    </div>
  )
}

function GroupForm({ mode, initial, busy, onSubmit, onClose }) {
  const [name, setName] = useState(initial)
  const canSave = name.trim().length > 0 && !busy
  return (
    <Modal
      title={mode === 'edit' ? 'Rename group' : 'New group'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" onClick={() => canSave && onSubmit(name)} disabled={!canSave}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <Field label="Group name">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSave && onSubmit(name)}
          placeholder="e.g. Banks" maxLength={40} />
      </Field>
    </Modal>
  )
}
