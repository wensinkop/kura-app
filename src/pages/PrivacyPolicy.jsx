// Public Privacy Policy. Content is owner-editable: it loads the admin-saved
// version from the `documents` table (slug 'privacy') and falls back to the
// bundled default in lib/legalContent.js. Rendered from Markdown — see
// lib/markdown.jsx. Satisfies Google Play, finance-app expectations, and
// Indonesia's UU PDP (Law 27/2022).

import LegalDoc from '../components/LegalDoc'
import { Markdown } from '../lib/markdown'
import { useDoc } from '../lib/useDoc'

export default function PrivacyPolicy() {
  const { title, body, updated } = useDoc('privacy')
  return (
    <LegalDoc title={title} updated={updated}>
      <Markdown md={body} />
    </LegalDoc>
  )
}
