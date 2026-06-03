// Public Help & FAQ. Owner-editable: loads the admin-saved version from the
// `documents` table (slug 'help') and falls back to the bundled default. The
// FAQ structure is parsed from Markdown — `## ` is a section, `### ` is a
// question, and the text beneath it is the answer (see parseFaq in lib/markdown).

import LegalDoc from '../components/LegalDoc'
import { Blocks, parseFaq } from '../lib/markdown'
import { useDoc } from '../lib/useDoc'
import { ChevronDown } from '../lib/icons'

function Section({ title, children }) {
  return (
    <div className="mt-7 first:mt-2">
      {title && <h2 className="text-[13px] font-bold uppercase tracking-wide text-faint mb-2 px-1">{title}</h2>}
      <div className="bg-surface border border-border rounded-[14px] overflow-hidden">{children}</div>
    </div>
  )
}

function QA({ q, children }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-surface-2">
        <span className="flex-1 font-semibold text-[14.5px] text-text">{q}</span>
        <ChevronDown className="w-[18px] h-[18px] text-faint transition-transform group-open:rotate-180 shrink-0" />
      </summary>
      <div className="px-4 pb-3 -mt-1">{children}</div>
    </details>
  )
}

export default function Help() {
  const { title, body, updated } = useDoc('help')
  const { intro, sections } = parseFaq(body)

  return (
    <LegalDoc title={title} updated={updated}>
      {intro.length > 0 && <Blocks blocks={intro} keyPrefix="intro" />}
      {sections.map((s, si) => (
        <Section key={si} title={s.title}>
          {s.items.map((qa, qi) => (
            <QA key={qi} q={qa.q}>
              <Blocks blocks={qa.answer} keyPrefix={`a-${si}-${qi}`} />
            </QA>
          ))}
        </Section>
      ))}
    </LegalDoc>
  )
}
