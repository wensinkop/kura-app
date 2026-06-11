// Shared SVG icons (stroke-based, currentColor) used across the Smara shell and
// pages. Paths lifted from the locked mockup design/kura-v5.html so the app
// matches the approved visual language. Pass `className` to size/recolor.

function Svg({ className = 'w-[22px] h-[22px]', children, ...rest }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p) => (
  <Svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></Svg>
)
export const StatsIcon = (p) => (
  <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>
)
export const AccountsIcon = (p) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></Svg>
)
export const SettingsIcon = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 12a7 7 0 000-2l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L15 2h-4l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1L11 22h4l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5z" />
  </Svg>
)
export const PlusIcon = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
)
export const SearchIcon = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></Svg>
)
export const FilterIcon = (p) => (
  <Svg {...p}><path d="M4 5h16M7 12h10M10 19h4" /></Svg>
)
export const ChevronLeft = (p) => (
  <Svg {...p}><path d="M15 18l-6-6 6-6" /></Svg>
)
export const ChevronRight = (p) => (
  <Svg {...p}><path d="M9 18l6-6-6-6" /></Svg>
)
export const ChevronUp = (p) => (
  <Svg {...p}><path d="M18 15l-6-6-6 6" /></Svg>
)
export const ChevronDown = (p) => (
  <Svg {...p}><path d="M6 9l6 6 6-6" /></Svg>
)
export const PencilIcon = (p) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Svg>
)
export const TrashIcon = (p) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></Svg>
)
export const ArchiveIcon = (p) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 001 1h12a1 1 0 001-1V8" /><path d="M10 12h4" /></Svg>
)
export const CloseIcon = (p) => (
  <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>
)
export const DownloadIcon = (p) => (
  <Svg {...p}><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></Svg>
)
export const UploadIcon = (p) => (
  <Svg {...p}><path d="M12 17V5" /><path d="M7 9l5-5 5 5" /><path d="M4 21h16" /></Svg>
)
export const SparkleIcon = (p) => (
  <Svg {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></Svg>
)
export const BudgetIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></Svg>
)
export const EyeIcon = (p) => (
  <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></Svg>
)
export const EyeOffIcon = (p) => (
  <Svg {...p}><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 004.2 4.2" /><path d="M9.9 5.2A9.5 9.5 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.6 4.4" /><path d="M6.1 6.1A17 17 0 002 12s3.5 7 10 7a9.5 9.5 0 003.9-.8" /></Svg>
)
export const GoalIcon = (p) => (
  <Svg {...p}><path d="M5 21V4" /><path d="M5 4h12l-2.5 3.5L17 11H5" /></Svg>
)
export const ShieldIcon = (p) => (
  <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /></Svg>
)
export const UsersIcon = (p) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0111 0" /><path d="M16 5.2a3.2 3.2 0 010 5.6" /><path d="M17 14.5a5.5 5.5 0 013.5 5.5" /></Svg>
)
