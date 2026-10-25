import type { ReactNode } from 'react'

// The product's own glyphs, in the stroke and the size of the icons of lucide-react, drawn from the text color.
function Glyph({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

// The mark of the small builder: a tent over a door.
export const Mark = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M3 20 12 4l9 16" />
    <path d="M9 20l3-5 3 5" />
  </Glyph>
)
