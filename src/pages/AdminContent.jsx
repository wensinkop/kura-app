// Admin-only editor for the published content pages (Privacy, Terms, Help/FAQ).
// Admin-guarded route. Loads each document from the `documents` table (or the
// bundled default), edits the title + Markdown body with a live preview and a
// formatting helper, and saves through the admin_upsert_document RPC (which
// re-checks is_admin() server-side). See lib/legalContent.js + lib/markdown.jsx.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { Button, TextInput } from '../components/ui'
import { ChevronLeft } from '../lib/icons'
import { getDocument, adminUpsertDocument } from '../lib/data'
import { DOC_LIST, DOCS } from '../lib/legalContent'
import { Blocks, Markdown, parseFaq, renderInline } from '../lib/markdown'

// Faithful-enough preview. Prose docs render exactly as the public page; the FAQ
// renders its sections with every question shown expanded so the editor can read
// all the answer text at once.
function Preview({ kind, body }) {
  if (kind !== 'faq') return <Markdown md={body} />
  const { intro, sections } = parseFaq(body)
  return (
    <div>
      {intro.length > 0 && <Blocks blocks={intro} keyPrefix="pv-intro" />}
      {sections.map((s, si) => (
        <div key={si} className="mt-6 first:mt-2">
          {s.title && <div className="text-[12px] font-bold uppercase tracking-wide text-faint mb-2">{s.title}</div>}
          {s.items.map((qa, qi) => (
            <div key={qi} className="mb-3">
              <div className="font-semibold text-[14.5px] text-text">{renderInline(qa.q, `pvq-${si}-${qi}`)}</div>
              <Blocks blocks={qa.answer} keyPrefix={`pva-${si}-${qi}`} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function FormattingHelp() {
  const rows = [
    ['**bold**', 'bold text'],
    ['*italic*', 'italic text'],
    ['## Section heading', 'a section'],
    ['### Question or sub-heading', 'a question (FAQ) / sub-heading'],
    ['- a bullet point', 'a bulleted list'],
    ['[link text](https://example.com)', 'a link'],
    ['[email me](mailto:you@example.com)', 'an email link'],
    ['---', 'a divider line'],
  ]
  return (
    <details className="bg-surface-2 border border-border rounded-[12px] overflow-hidden">
      <summary className="px-3.5 py-2.5 cursor-pointer list-none font-semibold text-[13.5px] text-text flex items-center gap-2">
        <span className="text-primary">＃</span> Formatting help (Markdown)
      </summary>
      <div className="px-3.5 pb-3.5 pt-1 space-y-2 text-[13px]">
        <p className="text-muted leading-relaxed">
          Type plain text. Leave a <span className="font-semibold text-text">blank line</span> between paragraphs.
          Use these for formatting:
        </p>
        <div className="rounded-[10px] border border-border overflow-hidden">
          {rows.map(([code, what], i) => (
            <div key={i} className="flex gap-3 px-3 py-1.5 border-t border-border first:border-t-0 items-baseline">
              <code className="text-[12.5px] text-text whitespace-pre-wrap flex-1">{code}</code>
              <span className="text-faint shrink-0">{what}</span>
            </div>
          ))}
        </div>
        <p className="text-muted leading-relaxed">
          For the <span className="font-semibold text-text">Help &amp; FAQ</span> page: <code className="text-text">##</code> starts
          a section, <code className="text-text">###</code> is a question, and the lines beneath it are the answer.
        </p>
      </div>
    </details>
  )
}

function DocList({ statuses, onPick }) {
  return (
    <div className="bg-surface border border-border rounded-[14px] overflow-hidden">
      {DOC_LIST.map((d) => (
        <button key={d.slug} onClick={() => onPick(d.slug)}
          className="w-full flex gap-3 items-center px-3.5 py-3.5 border-t border-border first:border-t-0 text-left hover:bg-surface-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[14.5px] text-text">{d.title}</div>
            <div className="text-xs text-muted mt-0.5">/{d.slug === 'help' ? 'help' : `legal/${d.slug}`}</div>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-1.5 py-0.5 ${
            statuses[d.slug] === 'edited' ? 'text-primary border-primary/40' : 'text-faint border-border'
          }`}>
            {statuses[d.slug] === 'edited' ? 'Edited' : 'Default'}
          </span>
          <span className="text-faint">›</span>
        </button>
      ))}
    </div>
  )
}

function Editor({ slug, onSaved }) {
  const def = DOCS[slug]
  const [title, setTitle] = useState(def.title)
  const [body, setBody] = useState(def.body)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { tone, text }

  useEffect(() => {
    let alive = true
    getDocument(slug).then(({ data, error }) => {
      if (!alive) return
      if (!error && data) { setTitle(data.title || def.title); setBody(data.body || def.body) }
      setLoading(false)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function save() {
    setBusy(true); setMsg(null)
    const { error } = await adminUpsertDocument(slug, title.trim() || def.title, body)
    setBusy(false)
    if (error) { setMsg({ tone: 'err', text: error.message || 'Could not save.' }); return }
    setMsg({ tone: 'ok', text: 'Saved — this is now live on the public page.' })
    onSaved(slug)
  }

  if (loading) return <p className="text-muted text-sm py-8 text-center">Loading…</p>

  return (
    <div className="grid gap-4 desk:grid-cols-2 desk:items-start">
      {/* Editor column */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-muted pl-0.5">Page title</span>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </label>

        <FormattingHelp />

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-muted pl-0.5">Content</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
            className="w-full min-h-[44dvh] desk:min-h-[60dvh] rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-text font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
          />
        </label>

        <div className="flex gap-2.5">
          <Button variant="ghost" className="flex-1" onClick={() => setBody(def.body)} disabled={busy}>Revert to default</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save & publish'}</Button>
        </div>

        {msg && (
          <div className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${
            msg.tone === 'ok' ? 'border-income/40 bg-income/10 text-income' : 'border-expense/40 bg-expense/10 text-expense'
          }`}>{msg.text}</div>
        )}
      </div>

      {/* Preview column */}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-muted pl-0.5 mb-1.5">Preview</div>
        <div className="bg-surface border border-border rounded-[14px] p-4 max-h-[70dvh] overflow-y-auto">
          <h1 className="text-[20px] font-extrabold text-text mb-3">{title}</h1>
          <Preview kind={def.kind} body={body} />
        </div>
      </div>
    </div>
  )
}

export default function AdminContent() {
  const navigate = useNavigate()
  const [slug, setSlug] = useState(null)
  const [statuses, setStatuses] = useState({}) // slug -> 'edited' | 'default'
  const loadedRef = useRef(false)

  // Which docs already have a saved override (for the Edited/Default badges).
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    Promise.all(DOC_LIST.map((d) => getDocument(d.slug))).then((results) => {
      const next = {}
      DOC_LIST.forEach((d, i) => { next[d.slug] = results[i]?.data ? 'edited' : 'default' })
      setStatuses(next)
    })
  }, [])

  const back = () => (slug ? setSlug(null) : navigate('/settings'))

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col h-[100dvh] min-w-0">
        <header className="shrink-0 bg-surface border-b border-border px-4 py-2.5 flex items-center gap-2">
          <button onClick={back} aria-label="Back" className="w-8 h-8 -ml-1 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
            <ChevronLeft />
          </button>
          <div className="font-bold text-[15px] flex-1">{slug ? `Edit · ${DOCS[slug].title}` : 'Admin · content'}</div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-income border border-income/40 rounded-full px-2 py-0.5">Admin</span>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-4 desk:px-8 w-full">
          <div className={slug ? 'max-w-[1100px] mx-auto' : 'max-w-[640px] mx-auto'}>
            {!slug && (
              <p className="text-[13px] text-muted mb-3 px-1">
                Edit the public Privacy, Terms and Help pages. Changes go live immediately for everyone.
              </p>
            )}
            {slug
              ? <Editor slug={slug} onSaved={(s) => setStatuses((st) => ({ ...st, [s]: 'edited' }))} />
              : <DocList statuses={statuses} onPick={setSlug} />}
          </div>
        </main>
      </div>
    </div>
  )
}
