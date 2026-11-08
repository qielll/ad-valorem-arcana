const BODY = 'M10 4h70l16 16v72a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z'

/** Small single-colour floppy for buttons. `bg` is the colour behind it (the shutter and label cut-outs). */
export function FloppyIcon({ className = '', bg = '#6eb0fe' }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path d={BODY} fill="currentColor" />
      <rect x="24" y="4" width="46" height="30" fill={bg} />
      <rect x="54" y="9" width="10" height="20" fill="currentColor" />
      <rect x="18" y="52" width="64" height="40" rx="2" fill={bg} />
      <rect x="26" y="64" width="48" height="6" fill="currentColor" />
      <rect x="26" y="77" width="32" height="6" fill="currentColor" />
    </svg>
  )
}

/** Medium-small coloured floppy that bobs while a "write" bar fills its label. */
export function FloppyLoader({ label = 'Saving...' }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="anim-rise absolute right-50 top-30 z-50 flex items-center gap-18 r-12 bg-navy px-24 py-16 shadow-[0_8px_22px_rgba(2,59,99,0.4)]"
    >
      <svg className="anim-bob h-88 w-88" viewBox="0 0 100 100" aria-hidden="true">
        <path d={BODY} fill="#2594fe" />
        <rect x="24" y="4" width="46" height="30" fill="#cde4ef" />
        <rect x="54" y="9" width="10" height="20" fill="#023b63" />
        <rect x="18" y="52" width="64" height="40" rx="2" fill="#ffc54a" />
        <rect x="26" y="64" width="48" height="8" fill="#023b63" opacity="0.25" />
        <rect className="anim-write" x="26" y="64" width="48" height="8" fill="#023b63" />
        <rect x="26" y="79" width="32" height="6" fill="#023b63" opacity="0.5" />
      </svg>
      <span className="fs-40 font-bold ls-2 text-white">{label}</span>
    </div>
  )
}
