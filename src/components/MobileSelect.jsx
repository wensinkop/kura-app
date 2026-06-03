import { forwardRef, useImperativeHandle, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, inputClass } from './ui'
import { ChevronDown, CloseIcon } from '../lib/icons'

// Mobile picker: a trigger styled like an input that opens a bottom sheet with a
// tappable list (grouped + optional "none" row). No text field, so the keyboard
// never appears and the sheet is never covered. Our own design — used instead of
// the OS-native <select> for Category / Sub-category / Account on mobile.
//
// Exposes an imperative `open()` (via ref) so the Sub-category picker can pop up
// automatically right after a Category with sub-categories is chosen.
//
// Props: value, onChange(value), options:[{value,label,group?}], placeholder,
//        title, noneLabel? (adds a clear-to-empty row at the top).
const MobileSelect = forwardRef(function MobileSelect(
  { value, onChange, options, placeholder = '— select —', title, noneLabel, onCreate },
  ref
) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), [])

  const selected = options.find((o) => o.value === value) || null

  function close() { setOpen(false); setCreating(false); setDraft('') }

  async function doCreate() {
    const name = draft.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      const v = await onCreate(name)
      if (v != null) { onChange(v); close() }
    } finally {
      setBusy(false)
    }
  }

  // Group options while preserving order; '' = ungrouped.
  const groups = []
  const byKey = new Map()
  for (const o of options) {
    const k = o.group || ''
    if (!byKey.has(k)) { byKey.set(k, []); groups.push(k) }
    byKey.get(k).push(o)
  }

  function pick(v) {
    onChange(v)
    close()
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className={`${inputClass} flex items-center justify-between text-left`}>
        <span className={`truncate ${selected ? '' : 'text-faint'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown className="w-4 h-4 text-faint shrink-0 ml-2" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-50 flex items-end bg-black/45"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}>
          <div className="bg-surface w-full rounded-t-2xl border-t border-border max-h-[70vh] flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="font-bold text-[15px] flex-1">{creating ? `New ${title?.toLowerCase() ?? 'item'}` : title}</div>
              <button onClick={close} aria-label="Close"
                className="w-9 h-9 -mr-1.5 rounded-[10px] grid place-items-center text-muted hover:bg-surface-2">
                <CloseIcon className="w-[18px] h-[18px]" />
              </button>
            </div>
            <div className="overflow-y-auto py-1 pb-[max(env(safe-area-inset-bottom),8px)]">
              {creating ? (
                <div className="p-4">
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') doCreate() }}
                    placeholder="Name" className={inputClass} />
                  <div className="flex gap-2.5 mt-3">
                    <Button variant="ghost" className="flex-1" onClick={() => { setCreating(false); setDraft('') }} disabled={busy}>Cancel</Button>
                    <Button className="flex-1" onClick={doCreate} disabled={busy || !draft.trim()}>{busy ? 'Creating…' : 'Create'}</Button>
                  </div>
                </div>
              ) : (
                <>
                  {noneLabel != null && <Item label={noneLabel} active={!value} onClick={() => pick('')} muted />}
                  {options.length === 0 && !onCreate && (
                    <div className="px-4 py-3 text-sm text-faint italic">No options</div>
                  )}
                  {groups.map((g) => (
                    <div key={g || '__'}>
                      {g && <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-faint">{g}</div>}
                      {byKey.get(g).map((o) => (
                        <Item key={o.value} label={o.label} active={o.value === value} onClick={() => pick(o.value)} />
                      ))}
                    </div>
                  ))}
                  {onCreate && (
                    <button type="button" onClick={() => { setCreating(true); setDraft('') }}
                      className="w-full text-left px-4 py-3 text-[15px] text-primary hover:bg-surface-2 border-t border-border">
                      ＋ Create new
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
})

function Item({ label, active, onClick, muted }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-4 py-3 text-[15px] flex items-center justify-between gap-2 hover:bg-surface-2 ${
        active ? 'text-primary font-semibold' : muted ? 'text-faint' : 'text-text'
      }`}>
      <span className="truncate">{label}</span>
      {active && <span className="text-primary shrink-0">✓</span>}
    </button>
  )
}

export default MobileSelect
