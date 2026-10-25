import { ChevronLeft, ChevronRight, Plus, Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { choice, Link, number, read, role, screen, text, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { Avatar, Badge, button, Card, DOTS, Empty, PageHeader, table } from '../components/ui'
import { orderCount, ordersByStatus, orderStats } from '../functions/orders'
import { orderScreen } from './order'

const PAGE = 20
const TABS = ['open', 'paid', 'shipped'] as const

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  title: 'Orders',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  state: {
    tab: { type: choice(['open', 'paid', 'shipped'], { default: 'open' }), in: 'address', back: true },
    page: { type: number({ default: 1, min: 1 }), in: 'address', reset: ['tab', 'search'] },
    search: { type: text({ default: '', max: 200 }) },
  },
  data: ({ state }) => ({
    orders: read(ordersByStatus, { status: state.tab, page: state.page, search: state.search }),
    count: read(orderCount, { status: state.tab, search: state.search }),
    stats: read(orderStats),
  }),
  view: ({ orders, count, stats, state, set }) => {
    const { t, format } = useTranslations()
    const [typed, setTyped] = useState(state.search)
    // The search is asked for once the typing has stopped, and not at every key.
    useEffect(() => {
      if (typed === state.search) return
      const timer = setTimeout(() => set({ search: typed }), 300)
      return () => clearTimeout(timer)
    }, [typed, state.search, set])
    const from = count === 0 ? 0 : (state.page - 1) * PAGE + 1
    const to = Math.min(state.page * PAGE, count)
    const waiting = typed !== state.search
    return (
      <>
        <PageHeader
          title={t('orders.title')}
          lead={t('orders.lead')}
          actions={
            <Link to="/orders/new" className={button.primary}>
              <Plus aria-hidden="true" className="size-4" />
              {t('nav.newOrder')}
            </Link>
          }
        />
        <Card>
          <div className="flex flex-col gap-3 border-b border-base-300 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <nav aria-label={t('orders.tabs')} className="-mx-1 overflow-x-auto px-1">
              <div className="tabs tabs-box tabs-sm w-max flex-nowrap bg-base-200/70 shadow-none">
                {TABS.map((tab) => {
                  const shown = stats.statuses.find((one) => one.status === tab)?.count ?? 0
                  return (
                    <Link key={tab} to={ordersScreen} with={{ tab }} keep className="tab gap-2 font-medium">
                      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOTS[tab]}`} />
                      {t(`status.${tab}`)}
                      <span className="badge badge-xs border-0 bg-base-content/10 tabular-nums">{shown}</span>
                    </Link>
                  )
                })}
              </div>
            </nav>
            <div className="input input-sm w-full sm:w-72">
              <Search aria-hidden="true" className="size-4 text-base-content/50" />
              <label htmlFor="order-search" className="sr-only">
                {t('orders.search')}
              </label>
              <input
                id="order-search"
                type="search"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={t('orders.searchHint')}
                autoComplete="off"
              />
              <span
                role="status"
                aria-label={waiting ? t('orders.searching') : undefined}
                className={`loading loading-spinner loading-xs text-base-content/50 ${waiting ? '' : 'invisible'}`}
              />
            </div>
          </div>
          {orders.length === 0 ? (
            <Empty
              icon={<SearchX aria-hidden="true" className="size-5" />}
              title={state.search ? t('orders.emptySearch', { search: state.search }) : t('orders.empty')}
            >
              {state.search && t('orders.emptyHint')}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className={table.frame}>
                <thead className={table.head}>
                  <tr>
                    <th scope="col" className={table.th}>
                      {t('orders.customer')}
                    </th>
                    <th scope="col" className={`${table.th} hidden sm:table-cell`}>
                      {t('orders.placed')}
                    </th>
                    <th scope="col" className={`${table.th} hidden md:table-cell`}>
                      {t('orders.status')}
                    </th>
                    <th scope="col" className={`${table.th} text-end`}>
                      {t('orders.total')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className={table.row}>
                      <td className={table.td}>
                        <span className="flex items-center gap-3">
                          <Avatar name={o.customer.name} />
                          <Link to={orderScreen} with={{ id: o.id }} className={table.cover}>
                            {o.customer.name}
                          </Link>
                        </span>
                      </td>
                      <td className={`${table.td} hidden text-base-content/70 tabular-nums sm:table-cell`}>
                        {format(o.placedAt, 'date')}
                      </td>
                      <td className={`${table.td} hidden md:table-cell`}>
                        <Badge tone={o.status}>{t(`status.${o.status}`)}</Badge>
                      </td>
                      <td className={`${table.td} text-end font-medium tabular-nums`}>{format(o.total, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav
            aria-label={t('orders.pages')}
            className="flex items-center justify-between gap-3 border-t border-base-300 px-4 py-3 text-sm sm:px-5"
          >
            <p className="text-base-content/70 tabular-nums">
              {t('orders.shown', { from: String(from), to: String(to), count: String(count) })}
            </p>
            <div className="flex gap-2">
              {state.page > 1 ? (
                <Link
                  to={ordersScreen}
                  with={{ tab: state.tab, page: state.page - 1 }}
                  className={`${button.quiet} btn-sm`}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  {t('orders.previous')}
                </Link>
              ) : (
                <span aria-disabled="true" className={`${button.quiet} btn-sm btn-disabled`}>
                  <ChevronLeft aria-hidden="true" className="size-4" />
                  {t('orders.previous')}
                </span>
              )}
              {to < count ? (
                <Link
                  to={ordersScreen}
                  with={{ tab: state.tab, page: state.page + 1 }}
                  className={`${button.quiet} btn-sm`}
                >
                  {t('orders.next')}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              ) : (
                <span aria-disabled="true" className={`${button.quiet} btn-sm btn-disabled`}>
                  {t('orders.next')}
                  <ChevronRight aria-hidden="true" className="size-4" />
                </span>
              )}
            </div>
          </nav>
        </Card>
      </>
    )
  },
})
