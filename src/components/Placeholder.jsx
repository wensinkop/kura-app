// Styled empty-state used by screens whose full features land in later chunks.
// Keeps the foundation looking intentional rather than blank.
export default function Placeholder({ icon, title, children, chunk }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border grid place-items-center text-muted mb-4">
          {icon}
        </div>
      )}
      <h2 className="text-lg font-bold text-text">{title}</h2>
      {children && <p className="text-sm text-muted mt-2 max-w-sm">{children}</p>}
      {chunk && (
        <span className="mt-4 text-[11px] font-bold uppercase tracking-wide text-faint bg-surface-2 border border-border rounded-full px-3 py-1">
          {chunk}
        </span>
      )}
    </div>
  )
}
