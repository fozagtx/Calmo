import { Link } from '@tanstack/react-router'

export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#1570EF" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#FFFFFF" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="4" fill="#FFFFFF" />
    </svg>
  )
}

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-xl outline-offset-4">
      <BrandMark />
      <span className="font-display text-[19px] font-semibold tracking-tight text-ink">Calmo</span>
    </Link>
  )
}
