import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import {
  listCategories, createCategory, renameCategory, deleteCategory,
  setCategoryArchived, persistOrder,
} from '../lib/data'
import { Button, Field, TextInput, Segmented, IconButton, Modal, ConfirmDialog } from '../components/ui'
import { PlusIcon, PencilIcon, TrashIcon, ArchiveIcon, ChevronUp, ChevronDown } from '../lib/icons'

// Opt-in starter sets (Stanley's choice: empty by default, one-tap to populate).
const STARTERS = {
  expense: ['Food & Groceries', 'Transport', 'Bills & Utilities', 'Shopping', 'Health', 'Entertainment', 'Subscriptions', 'Education'],
  income: ['Salary', 'Bonus', 'Business', 'Investment', 'Gift', 'Other Income'],
}

export default function SettingsCategories() {
  const { user } = useAuth()
  const [kind, setKind] = useState('expense')
  const [cats, setCats] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [form, setForm] = useState(null) // { mode:'create'|'edit', parentId, target }
  const [confirm, setConfirm] = useState(null) // { cat }
  const [busy, setBusy] = useState(false)

  async function reload() {
    const { data, error } = await listCategories()
    if (!error) setCats(data ?? [])
    setLoading(false)
  }

  // Initial load — inline `.then` so the setState lands in an async callback
  // (satisfies react-hooks set-state-in-effect).
  useEffect(() => {
    listCategories().then(({ data, error }) => {
      if (!error) setCats(data ?? [])
      setLoading(false)
    })
  }, [])

  const ofKind = cats.filter((c) => c.kind === kind)
  const visible = ofKind.filter((c) => showArchived || !c.archived)
  const tops = visible.filter((c) => !c.parent_id)
  const subsOf = (id) => visible.filter((c) => c.parent_id === id)
  const archivedCount = ofKind.filter((c) => c.archived).length

  async function move(list, index, dir, table) {
    const next = index + dir
    if (next < 0 || next >= list.length) return
    const reordered = [...list]
    ;[reordered[index], reordered[next]] = [reordered[next], reordered[index]]
    setCats((prev) => {
      // optimistic: reflect new order locally by reassigning sort_order
      const orderMap = new Map(reordered.map((c, i) => [c.id, i]))
      return prev.map((c) => (orderMap.has(c.id) ? { ...c, sort_order: orderMap.get(c.id) } : c))
    })
    await persistOrder(table, reordered.map((c) => c.id))
    reload()
  }

  async function addStarters() {
    setBusy(true)
    const existing = ofKind.filter((c) => !c.parent_id).length
    const names = STARTERS[kind]
    for (let i = 0; i < names.length; i++) {
      await createCategory(user.id, { kind, name: names[i], parent_id: null }, existing + i)
    }
    setBusy(false)
    reload()
  }

  async function submitForm(name) {
    setBusy(true)
    if (form.mode === 'edit') {
      await renameCategory(form.target.id, name)
    } else {
      const siblings = form.parentId
        ? cats.filter((c) => c.parent_id === form.parentId)
        : cats.filter((c) => c.kind === kind && !c.parent_id)
      await createCategory(user.id, { kind, name, parent_id: form.parentId ?? null }, siblings.length)
    }
    setBusy(false)
    setForm(null)
    reload()
  }

  async function doDelete() {
    setBusy(true)
    await deleteCategory(confirm.cat.id)
    setBusy(false)
    setConfirm(null)
    reload()
  }

  async function toggleArchive(cat) {
    await setCategoryArchived(cat.id, !cat.archived)
    reload()
  }

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="max-w-[640px] mx-auto">
      <div className="mb-4">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
        />
      </div>

      <Button className="w-full mb-4" onClick={() => setForm({ mode: 'create', parentId: null })}>
        <PlusIcon className="w-[18px] h-[18px]" /> Add {kind} category
      </Button>

      {tops.length === 0 ? (
        <div className="bg-surface border border-border rounded-[14px] p-6 text-center">
          <p className="text-sm text-muted mb-4">
            No {kind} categories yet. Start from scratch above, or add a starter set you can rename later.
          </p>
          <Button variant="ghost" onClick={addStarters} disabled={busy}>
            {busy ? 'Adding…' : `Add starter ${kind} categories`}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tops.map((cat, i) => (
            <div key={cat.id} className="bg-surface border border-border rounded-[14px] overflow-hidden">
              <Row
                cat={cat}
                isFirst={i === 0}
                isLast={i === tops.length - 1}
                onUp={() => move(tops, i, -1, 'categories')}
                onDown={() => move(tops, i, 1, 'categories')}
                onAddSub={() => setForm({ mode: 'create', parentId: cat.id })}
                onEdit={() => setForm({ mode: 'edit', target: cat })}
                onArchive={() => toggleArchive(cat)}
                onDelete={() => setConfirm({ cat })}
              />
              {subsOf(cat.id).map((sub, j, arr) => (
                <Row
                  key={sub.id}
                  cat={sub}
                  isSub
                  isFirst={j === 0}
                  isLast={j === arr.length - 1}
                  onUp={() => move(arr, j, -1, 'categories')}
                  onDown={() => move(arr, j, 1, 'categories')}
                  onEdit={() => setForm({ mode: 'edit', target: sub })}
                  onArchive={() => toggleArchive(sub)}
                  onDelete={() => setConfirm({ cat: sub })}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <button
          onClick={() => setShowArchived((s) => !s)}
          className="text-xs font-semibold text-faint hover:text-muted mt-4 px-1"
        >
          {showArchived ? 'Hide' : 'Show'} archived ({archivedCount})
        </button>
      )}

      {form && (
        <CategoryForm
          mode={form.mode}
          initial={form.target?.name ?? ''}
          isSub={!!form.parentId}
          kind={kind}
          busy={busy}
          onSubmit={submitForm}
          onClose={() => setForm(null)}
        />
      )}

      {confirm && (() => {
        const hasSubs = subsOf(confirm.cat.id).length > 0
        return (
          <ConfirmDialog
            title={hasSubs ? `"${confirm.cat.name}" has sub-categories` : `Delete "${confirm.cat.name}"?`}
            message={
              hasSubs
                ? 'Delete or move its sub-categories first, then you can delete this category.'
                : 'Deleting a category leaves its past transactions without a category (they are not deleted). You can also Archive instead to keep it for reference.'
            }
            confirmLabel={hasSubs ? 'OK' : 'Delete'}
            tone={hasSubs ? 'primary' : 'danger'}
            busy={busy}
            onConfirm={hasSubs ? () => setConfirm(null) : doDelete}
            onClose={() => setConfirm(null)}
          />
        )
      })()}
    </div>
  )
}

function Row({ cat, isSub, isFirst, isLast, onUp, onDown, onAddSub, onEdit, onArchive, onDelete }) {
  return (
    <div className={`flex items-center gap-1 px-3 py-2.5 border-t border-border first:border-t-0 ${isSub ? 'pl-7 bg-surface-2/40' : ''}`}>
      <div className="flex flex-col -ml-1 mr-0.5">
        <IconButton label="Move up" onClick={onUp} disabled={isFirst}><ChevronUp className="w-4 h-4" /></IconButton>
        <IconButton label="Move down" onClick={onDown} disabled={isLast}><ChevronDown className="w-4 h-4" /></IconButton>
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-[14.5px] truncate ${cat.archived ? 'text-faint line-through' : 'text-text'}`}>
          {cat.name}
        </div>
        {cat.archived && <div className="text-[10.5px] uppercase tracking-wide text-faint font-bold">Archived</div>}
      </div>
      {!isSub && onAddSub && (
        <IconButton label="Add sub-category" onClick={onAddSub}><PlusIcon className="w-[17px] h-[17px]" /></IconButton>
      )}
      <IconButton label="Edit" onClick={onEdit}><PencilIcon className="w-[16px] h-[16px]" /></IconButton>
      <IconButton label={cat.archived ? 'Unarchive' : 'Archive'} onClick={onArchive}><ArchiveIcon className="w-[16px] h-[16px]" /></IconButton>
      <IconButton label="Delete" danger onClick={onDelete}><TrashIcon className="w-[16px] h-[16px]" /></IconButton>
    </div>
  )
}

function CategoryForm({ mode, initial, isSub, kind, busy, onSubmit, onClose }) {
  const [name, setName] = useState(initial)
  const title =
    mode === 'edit' ? 'Rename category' : isSub ? `New sub-category` : `New ${kind} category`
  const canSave = name.trim().length > 0 && !busy
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button className="flex-1" onClick={() => canSave && onSubmit(name)} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && canSave && onSubmit(name)}
          placeholder={isSub ? 'e.g. Streaming' : kind === 'income' ? 'e.g. Salary' : 'e.g. Food & Groceries'}
          maxLength={60}
        />
      </Field>
    </Modal>
  )
}
