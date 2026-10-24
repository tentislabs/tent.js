import { Inbox } from 'lucide-react'
import { Link, read, role, screen, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { Overview } from '../components/Overview'
import { StatusPill } from '../components/status'
import { ticketList } from '../functions/tickets'
import { ticketScreen } from './ticket'

export const ticketsScreen = screen('ticketsScreen', {
  path: '/tickets',
  title: 'Tickets',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: { tickets: read(ticketList, {}) },
  view: ({ tickets }) => {
    const { format } = useTranslations()
    return (
      <>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="mt-1 text-sm text-base-content/70">Every mail to the support address, newest first.</p>
        </header>
        <Overview tickets={tickets} />
        <section className="overflow-hidden rounded-box border border-base-300 bg-base-100" aria-label="Tickets">
          <div className="flex items-baseline justify-between gap-4 border-b border-base-300 px-5 py-4">
            <h2 className="font-semibold">All tickets</h2>
            <span className="text-sm tabular-nums text-base-content/60">{format(tickets.length, 'number')}</span>
          </div>
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Inbox className="size-6 text-base-content/50" aria-hidden="true" />
              <strong className="font-medium">No ticket has come in</strong>
              <span className="text-sm text-base-content/60">A mail to the support address shows here at once.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr className="text-base-content/60">
                    <th scope="col">Subject</th>
                    <th scope="col" className="max-sm:hidden">
                      Customer
                    </th>
                    <th scope="col">Status</th>
                    <th scope="col" className="max-sm:hidden">
                      Order
                    </th>
                    <th scope="col" className="max-sm:hidden">
                      Came in
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} id={`ticket-${ticket.id}`} className="hover:bg-base-200/60">
                      <td className="font-medium sm:min-w-48">
                        <Link
                          to={ticketScreen}
                          with={{ id: ticket.id }}
                          className="hover:text-primary hover:underline focus-visible:underline"
                        >
                          {ticket.subject}
                        </Link>
                        <span className="mt-0.5 block text-xs font-normal text-base-content/60 sm:hidden">
                          {ticket.customer.name}, {format(ticket.createdAt, 'relative')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-base-content/80 max-sm:hidden">{ticket.customer.name}</td>
                      <td>
                        <StatusPill status={ticket.status} />
                      </td>
                      <td className="font-mono text-xs text-base-content/60 max-sm:hidden">{ticket.order ?? '-'}</td>
                      <td className="whitespace-nowrap text-base-content/60 tabular-nums max-sm:hidden">
                        {format(ticket.createdAt, 'relative')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </>
    )
  },
})
