export const STATUSES = ['open', 'answered', 'closed'] as const

export type Status = (typeof STATUSES)[number]

const NAMES: Record<Status, string> = { open: 'Open', answered: 'Answered', closed: 'Closed' }

/** The name of a status as a person reads it. */
export function statusName(status: Status): string {
  return NAMES[status]
}

/** The status of a ticket as a pill, in the color of its status. */
export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`status-${status} inline-flex items-center gap-1.5 rounded-full border border-base-300 bg-base-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap`}
    >
      <span className="size-1.5 rounded-full bg-(--status)" aria-hidden="true" />
      {NAMES[status]}
    </span>
  )
}
