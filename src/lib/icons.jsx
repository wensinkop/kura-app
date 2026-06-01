// Shared SVG icons (stroke-based, currentColor) used across the Kura shell and
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
