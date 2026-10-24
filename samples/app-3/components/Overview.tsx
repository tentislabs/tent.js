import { useTranslations } from 'tentjs/ui'
import { STATUSES, type Status, statusName } from './status'

type Counted = { status: Status; createdAt: string }

const DAYS = 14

// The last fourteen days, oldest first, each as its day in the standard form.
function lastDays(today: Date): string[] {
  return Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - (DAYS - 1 - i))
    return day.toISOString().slice(0, 10)
  })
}

function Tile({ name, value, status }: { name: string; value: number; status?: Status }) {
  const { format } = useTranslations()
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5">
      <dt className="flex items-center gap-2 text-sm text-base-content/70">
        <span
          className={`size-2 rounded-full ${status ? `status-${status} bg-(--status)` : 'bg-primary'}`}
          aria-hidden="true"
        />
        {name}
      </dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{format(value, 'number')}</dd>
    </div>
  )
}

/** The numbers of the tickets: a tile for each status, their shares, and the tickets that came in each day. */
export function Overview({ tickets }: { tickets: readonly Counted[] }) {
  const { format } = useTranslations()
  const counts = Object.fromEntries(
    STATUSES.map((status) => [status, tickets.filter((t) => t.status === status).length]),
  )
  const all = Math.max(1, tickets.length)
  const days = lastDays(new Date())
  const perDay = days.map((day) => tickets.filter((t) => t.createdAt.slice(0, 10) === day).length)
  const most = Math.max(1, ...perDay)
  const week = perDay.slice(-7).reduce((sum, n) => sum + n, 0)
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="The tickets in numbers">
        {STATUSES.map((status) => (
          <Tile key={status} name={statusName(status)} value={counts[status] ?? 0} status={status} />
        ))}
        <Tile name="New in 7 days" value={week} />
      </dl>
      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <section className="rounded-box border border-base-300 bg-base-100 p-5" aria-label="Tickets by status">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">By status</h2>
            <span className="text-sm text-base-content/60">{format(tickets.length, 'number')} in all</span>
          </div>
          <div
            className="mt-6 flex h-3 gap-1 overflow-hidden rounded-full"
            role="img"
            aria-label="The share of each status"
          >
            {STATUSES.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
              <span
                key={status}
                className={`status-${status} h-full rounded-full bg-(--status)`}
                style={{ width: `${((counts[status] ?? 0) / all) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-6 space-y-3 text-sm">
            {STATUSES.map((status) => (
              <li key={status} className="flex items-center gap-3">
                <span className={`status-${status} size-2 rounded-full bg-(--status)`} aria-hidden="true" />
                <span className="flex-1">{statusName(status)}</span>
                <span className="tabular-nums text-base-content/60">{format(counts[status] ?? 0, 'number')}</span>
                <b className="w-12 text-right font-medium tabular-nums">
                  {format((counts[status] ?? 0) / all, 'percent')}
                </b>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-box border border-base-300 bg-base-100 p-5" aria-label="New tickets by day">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-semibold">New tickets</h2>
            <span className="text-sm text-base-content/60">The last {DAYS} days</span>
          </div>
          <div className="mt-5" role="img" aria-label="New tickets each day">
            <div className="relative flex h-32 items-end gap-1.5 border-b border-base-300 sm:gap-2">
              <span className="absolute inset-x-0 top-0 border-t border-dashed border-base-300" aria-hidden="true" />
              <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-base-300" aria-hidden="true" />
              {perDay.map((n, i) => (
                <span
                  key={days[i]}
                  title={`${days[i]}: ${n}`}
                  className={`relative flex-1 rounded-t-md ${i === DAYS - 1 ? 'bg-primary' : 'bg-primary/35'}`}
                  style={{ height: n > 0 ? `max(4px, ${(n / most) * 100}%)` : 0 }}
                />
              ))}
            </div>
            <div className="mt-2 flex gap-1.5 text-center text-xs tabular-nums text-base-content/55 sm:gap-2">
              {days.map((day, i) => (
                <span key={day} className="flex-1">
                  {i % 2 === 1 ? day.slice(8) : ''}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
