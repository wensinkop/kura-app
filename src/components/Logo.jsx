// Kura brand mark — a turtle (steady, patient) on the Kura green, in a rounded
// square so it reads the same as the app launcher icon. `BrandMark` is just the
// badge; `Logo` is the badge + "Kura" wordmark used in headers and auth screens.

export function BrandMark({ className = 'w-7 h-7', rounded = 12 }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Kura" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx={rounded} fill="#047857" />
      {/* legs */}
      <g fill="#ffffff">
        <rect x="10.5" y="26" width="7" height="9.5" rx="3.5" transform="rotate(-20 14 31)" />
        <rect x="30.5" y="26" width="7" height="9.5" rx="3.5" transform="rotate(20 34 31)" />
        <rect x="16" y="29.5" width="7" height="9.5" rx="3.5" transform="rotate(-7 19.5 34)" />
        <rect x="25" y="29.5" width="7" height="9.5" rx="3.5" transform="rotate(7 28.5 34)" />
      </g>
      {/* tail */}
      <path d="M10.5 25 l-3.5 -1.4 v3 z" fill="#ffffff" />
      {/* head + eye */}
      <circle cx="38.6" cy="22" r="4.6" fill="#ffffff" />
      <circle cx="40.2" cy="20.6" r="0.95" fill="#047857" />
      {/* shell */}
      <path d="M9.5 26 C9.5 16.6 15.8 11.5 23 11.5 C30.2 11.5 36.5 16.6 36.5 26 C36.5 31.2 30.2 34.5 23 34.5 C15.8 34.5 9.5 31.2 9.5 26 Z" fill="#ffffff" />
      {/* shell segments */}
      <g fill="none" stroke="#047857" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 13.5 L23 33" />
        <path d="M11.5 21 Q23 16.8 34.5 21" />
        <path d="M10.6 28.5 Q23 33.5 35.4 28.5" />
      </g>
    </svg>
  )
}

export default function Logo({ className = '', markClassName = 'w-7 h-7', textClassName = 'text-[18px]' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold tracking-[-.3px] ${className}`}>
      <BrandMark className={markClassName} />
      <span className={textClassName}>Kura</span>
    </span>
  )
}
