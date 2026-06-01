import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../lib/icons'
import Placeholder from '../components/Placeholder'
import { PlusIcon } from '../lib/icons'

// Full-screen on mobile, full-page on desktop (the sidebar persists via the
// route nesting). Real multi-row entry is built in Chunk 2; this is the shell.
export default function NewTransaction() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <header className="sticky top-0 z-20 bg-surface border-b border-border px-4 py-3.5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="w-9 h-9 grid place-items-center rounded-[10px] text-muted hover:bg-surface-2">
          <ChevronLeft />
        </button>
        <div className="font-bold text-[17px]">New transactions</div>
      </header>
      <div className="flex-1">
        <Placeholder icon={<PlusIcon />} title="Multi-row transaction entry" chunk="Coming in Chunk 2">
          The keyboard-first entry screen — Income / Expense / Transfer, multiple rows, category and
          note suggestions, locale-aware amounts — is the focus of Chunk 2. The reusable inputs it
          needs are already built.
        </Placeholder>
      </div>
    </div>
  )
}
