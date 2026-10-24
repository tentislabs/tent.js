import { type ReactNode, useEffect, useRef } from 'react'

// The pieces every screen draws with, on daisyUI's components, so one type scale, one spacing scale and one palette hold everywhere.

export const button = {
  primary: 'btn btn-primary',
  quiet: 'btn btn-outline border-base-300 bg-base-100 hover:bg-base-200 hover:border-base-300',
  ghost: 'btn btn-ghost font-medium text-base-content/70 hover:text-base-content',
}

// A move by a link puts the focus on the heading of the new screen; a step back through the history does not, so the heading takes it then.
let cameBack = false
if (typeof window !== 'undefined')
  window.addEventListener('popstate', () => {
    cameBack = true
  })

export function Heading({ className, children }: { className: string; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!cameBack) return
    cameBack = false
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <h1 ref={heading} tabIndex={-1} className={className}>
      {children}
    </h1>
  )
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <Heading className="text-2xl font-semibold tracking-tight">{title}</Heading>
        {lead && <p className="mt-1 text-sm text-base-content/70">{lead}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({
  title,
  aside,
  className = '',
  children,
}: {
  title?: string
  aside?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`card border border-base-300 bg-base-100 shadow-xs ${className}`}>
      {title && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-base-300 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

// The colors of a status and of a tier, each a pair that reads well in light and in dark.
const TONES = {
  open: 'bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-200',
  paid: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-200',
  shipped: 'bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-200',
  gold: 'bg-yellow-100 text-yellow-900 dark:bg-yellow-400/15 dark:text-yellow-200',
  standard: 'bg-base-200 text-base-content/80',
}

export const DOTS = { open: 'bg-amber-500', paid: 'bg-emerald-500', shipped: 'bg-sky-500' }

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return <span className={`badge badge-sm border-0 font-medium ${TONES[tone]}`}>{children}</span>
}

export function Avatar({ name }: { name: string }) {
  const letters = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
    >
      {letters}
    </span>
  )
}

export function Stat({ label, value, note, dot }: { label: string; value: string; note?: string; dot?: string }) {
  return (
    <div className="card border border-base-300 bg-base-100 p-4 shadow-xs sm:p-5">
      <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-base-content/70 uppercase">
        {dot && <span aria-hidden="true" className={`size-2 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{value}</p>
      {note && <p className="mt-1 text-sm text-base-content/70 tabular-nums">{note}</p>}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 inline-flex size-10 items-center justify-center rounded-full bg-base-200 text-base-content/50">
        {icon}
      </span>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="text-sm text-base-content/70">{children}</div>}
    </div>
  )
}

export const table = {
  frame: 'table',
  head: 'bg-base-200/60 text-xs tracking-wide text-base-content/70 uppercase',
  th: 'px-5 font-medium',
  row: 'relative border-base-300 transition-colors hover:bg-base-200/60 focus-within:bg-base-200/60',
  td: 'px-5',
  // A link that covers its whole row, so the row is one target for a pointer and one stop for the keyboard.
  cover:
    'font-medium after:absolute after:inset-0 after:content-[""] focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-primary',
}

export const label = 'text-xs font-medium tracking-wide text-base-content/70 uppercase'
