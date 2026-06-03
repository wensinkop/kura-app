// Public Terms & Conditions. Owner-editable: loads the admin-saved version from
// the `documents` table (slug 'terms') and falls back to the bundled default in
// lib/legalContent.js. Rendered from Markdown — see lib/markdown.jsx.

import LegalDoc from '../components/LegalDoc'
import { Markdown } from '../lib/markdown'
import { useDoc } from '../lib/useDoc'

export default function Terms() {
  const { title, body, updated } = useDoc('terms')
  return (
    <LegalDoc title={title} updated={updated}>
      <Markdown md={body} />
    </LegalDoc>
  )
}
