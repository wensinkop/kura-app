// Tiny, dependency-free Markdown renderer for the owner-editable content pages
// (Privacy, Terms, Help/FAQ). It emits React nodes — never raw HTML — so there
// is no XSS surface even though an admin authors the text. It deliberately
// supports only the small syntax shown in the editor's formatting helper:
//
//   #  ## ###   headings (section / sub-heading)
//   **bold**    *italic*
//   - item      bullet list (also `* item`)
//   [text](url) link (http(s), mailto:, or in-app /path)
//   ---         horizontal divider
//   blank line  new paragraph
//
// For the FAQ page the structure is meaningful: `##` is a section and `###` is a
// question (the blocks beneath it are its answer) — see parseFaq().

/* eslint-disable react-refresh/only-export-components --
   utility module: small render components colocated with their parser helpers. */
import { H2, P, UL, LI } from '../components/LegalDoc'

// ---- Inline parsing: **bold**, *italic*, [text](url) ----------------------
const INLINE_RE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/

export function renderInline(text, keyPrefix = 'x') {
  const out = []
  let rest = text ?? ''
  let k = 0
  while (rest.length) {
    const m = INLINE_RE.exec(rest)
    if (!m) { out.push(rest); break }
    if (m.index > 0) out.push(rest.slice(0, m.index))
    if (m[1]) out.push(<strong key={`${keyPrefix}-b${k++}`} className="font-semibold text-text">{m[2]}</strong>)
    else if (m[3]) out.push(<em key={`${keyPrefix}-i${k++}`}>{m[4]}</em>)
    else out.push(
      <a key={`${keyPrefix}-a${k++}`} href={m[7]} className="text-primary font-semibold hover:underline">{m[6]}</a>
    )
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

// ---- Block parsing --------------------------------------------------------
// Returns tokens: {type:'h1'|'h2'|'h3'|'p'|'ul'|'hr', text?|items?}.
export function parseBlocks(md) {
  const lines = (md ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let para = []
  let list = null
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = [] } }
  const flushList = () => { if (list) { blocks.push({ type: 'ul', items: list }); list = null } }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }
    let m
    if ((m = /^###\s+(.*)$/.exec(line))) { flushPara(); flushList(); blocks.push({ type: 'h3', text: m[1] }) }
    else if ((m = /^##\s+(.*)$/.exec(line))) { flushPara(); flushList(); blocks.push({ type: 'h2', text: m[1] }) }
    else if ((m = /^#\s+(.*)$/.exec(line))) { flushPara(); flushList(); blocks.push({ type: 'h1', text: m[1] }) }
    else if (/^---+$/.test(line)) { flushPara(); flushList(); blocks.push({ type: 'hr' }) }
    else if ((m = /^[-*]\s+(.*)$/.exec(line))) { flushPara(); (list ??= []).push(m[1]) }
    else { flushList(); para.push(line) }
  }
  flushPara(); flushList()
  return blocks
}

// ---- Rendering ------------------------------------------------------------
function H3({ children }) {
  return <h3 className="text-[15px] font-bold text-text mt-5 mb-1.5">{children}</h3>
}

export function Blocks({ blocks, keyPrefix = 'blk' }) {
  return blocks.map((b, i) => {
    const key = `${keyPrefix}-${i}`
    switch (b.type) {
      case 'h1':
      case 'h2': return <H2 key={key}>{renderInline(b.text, key)}</H2>
      case 'h3': return <H3 key={key}>{renderInline(b.text, key)}</H3>
      case 'ul': return <UL key={key}>{b.items.map((it, j) => <LI key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</LI>)}</UL>
      case 'hr': return <hr key={key} className="my-6 border-border" />
      default:   return <P key={key}>{renderInline(b.text, key)}</P>
    }
  })
}

export function Markdown({ md }) {
  return <Blocks blocks={parseBlocks(md)} />
}

// ---- FAQ structure: ## section → ### question → answer blocks -------------
export function parseFaq(md) {
  const blocks = parseBlocks(md)
  const sections = []
  let section = null
  let qa = null
  const intro = []
  for (const b of blocks) {
    if (b.type === 'h2' || b.type === 'h1') {
      section = { title: b.text, items: [] }
      sections.push(section)
      qa = null
    } else if (b.type === 'h3') {
      if (!section) { section = { title: '', items: [] }; sections.push(section) }
      qa = { q: b.text, answer: [] }
      section.items.push(qa)
    } else if (qa) {
      qa.answer.push(b)
    } else if (!section) {
      intro.push(b)
    }
  }
  return { intro, sections }
}
