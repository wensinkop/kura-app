// Loads an owner-editable document (Privacy / Terms / Help) for the public
// pages. Starts from the bundled default so there's no loading flash, then
// swaps in the admin-saved override from the `documents` table if one exists.
// Falls back to the default on any error (e.g. offline).

import { useEffect, useState } from 'react'
import { getDocument } from './data'
import { DOCS } from './legalContent'

function fmtDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return null
  }
}

export function useDoc(slug) {
  const def = DOCS[slug]
  const [state, setState] = useState({ title: def.title, body: def.body, updated: def.updated })

  useEffect(() => {
    let alive = true
    getDocument(slug).then(({ data, error }) => {
      if (!alive || error || !data) return
      setState({
        title: data.title || def.title,
        body: data.body || def.body,
        updated: fmtDate(data.updated_at) || def.updated,
      })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  return state
}
