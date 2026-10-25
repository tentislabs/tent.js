import type { ReactElement } from 'react'

// The mark of an app the bots reach through MCP, drawn by the app itself in plain shapes.

const MARKS: Record<string, { ground: string; draw: () => ReactElement }> = {
  files: {
    ground: '#fff7e6',
    draw: () => (
      <>
        <path d="M3 7a2 2 0 0 1 2-2h4.5l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="#f5a623" />
        <path d="M3 10h18v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="#ffc24d" />
      </>
    ),
  },
  browser: {
    ground: '#eaf3ff',
    draw: () => (
      <>
        <circle cx="12" cy="12" r="8.5" fill="#2f80ed" />
        <path
          d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5M12 3.5C9.4 5.9 8.2 8.7 8.2 12s1.2 6.1 3.8 8.5"
          stroke="#fff"
          strokeWidth="1.4"
          fill="none"
        />
      </>
    ),
  },
  calendar: {
    ground: '#eef4ff',
    draw: () => (
      <>
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="#fff" stroke="#3b6fd8" strokeWidth="1.5" />
        <path d="M3.5 9.5h17" stroke="#3b6fd8" strokeWidth="1.5" />
        <path d="M8 3.5v3M16 3.5v3" stroke="#3b6fd8" strokeWidth="1.5" strokeLinecap="round" />
        <text x="12" y="17.6" textAnchor="middle" fontSize="7" fontWeight="700" fill="#3b6fd8" fontFamily="system-ui">
          31
        </text>
      </>
    ),
  },
  mail: {
    ground: '#fff0ee',
    draw: () => (
      <>
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="#e8553f" />
        <path d="m4 7.5 8 6 8-6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
      </>
    ),
  },
  other: {
    ground: '#f0f0f0',
    draw: () => (
      <>
        <rect x="4" y="4" width="7" height="7" rx="2" fill="#6b6b6b" />
        <rect x="13" y="4" width="7" height="7" rx="2" fill="#9a9a9a" />
        <rect x="4" y="13" width="7" height="7" rx="2" fill="#9a9a9a" />
        <rect x="13" y="13" width="7" height="7" rx="2" fill="#6b6b6b" />
      </>
    ),
  },
}

/** The kind of mark an app is drawn with, read from its name. */
export function markOf(name: string): string {
  const words = name.toLowerCase()
  if (words.includes('file') || words.includes('folder')) return 'files'
  if (words.includes('browser') || words.includes('playwright') || words.includes('web')) return 'browser'
  if (words.includes('calendar')) return 'calendar'
  if (words.includes('mail')) return 'mail'
  return 'other'
}

export function AppMark({ kind, size = 18 }: { kind: string; size?: number }) {
  const mark = MARKS[kind] ?? MARKS.other
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ background: mark.ground }}>
      {mark.draw()}
    </svg>
  )
}
