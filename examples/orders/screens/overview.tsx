import { ArrowRight, Plus } from 'lucide-react'
import { Link, read, role, screen, useTranslations } from 'tentjs/ui'
import { TakingsChart } from '../components/charts'
import { StaffFrame, Waiting } from '../components/frames'
import { Avatar, Badge, button, Card, DOTS, label, PageHeader, Stat, table } from '../components/ui'
import { ordersByStatus, orderStats } from '../functions/orders'
import { orderScreen } from './order'

export const overviewScreen = screen('overviewScreen', {
  path: '/',
  title: 'Overview',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: { stats: read(orderStats), newest: read(ordersByStatus, { status: 'open', page: 1, search: '' }) },
  view: ({ stats, newest, language }) => {
    const { t, format } = useTranslations()
    const all = stats.statuses.reduce((sum, one) => sum + one.count, 0)
    const sum = stats.statuses.reduce((total, one) => total + one.total, 0)
    const month = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' })
    const compact = new Intl.NumberFormat(language, {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1,
    })
    const best = stats.buyers[0]?.total ?? 1
    return (
      <>
        <PageHeader
          title={t('overview.title')}
          lead={t('overview.lead')}
          actions={
            <Link to="/orders/new" className={button.primary}>
              <Plus aria-hidden="true" className="size-4" />
              {t('nav.newOrder')}
            </Link>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {stats.statuses.map((one) => (
            <Stat
              key={one.status}
              label={t(`status.${one.status}`)}
              value={format(one.total, 'currency')}
              note={t('count.orders', { count: one.count })}
              dot={DOTS[one.status]}
            />
          ))}
          <Stat
            label={t('overview.average')}
            value={format(all === 0 ? 0 : sum / all, 'currency')}
            note={t('overview.across', { count: format(all, 'number') })}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card
            title={t('overview.months')}
            className="lg:col-span-2"
            aside={
              <div className="flex items-center gap-4 text-xs text-base-content/70">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-xs bg-primary" />
                  {t('overview.taken')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-2 rounded-xs bg-primary/35" />
                  {t('overview.waiting')}
                </span>
              </div>
            }
          >
            <div className="p-4 pe-5">
              <TakingsChart
                months={stats.months.map((m) => ({
                  label: month.format(new Date(`${m.month}-01T00:00:00Z`)),
                  taken: m.taken,
                  open: m.open,
                }))}
                money={(cents) => format(cents, 'currency')}
                short={(cents) => compact.format(cents / 100)}
                names={{ taken: t('overview.taken'), open: t('overview.waiting') }}
              />
            </div>
          </Card>

          <Card title={t('overview.split')}>
            <div className="flex flex-col gap-5 p-5">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-base-200" aria-hidden="true">
                {stats.statuses.map((one) => (
                  <span
                    key={one.status}
                    className={DOTS[one.status]}
                    style={{ width: `${all === 0 ? 0 : (one.count / all) * 100}%` }}
                  />
                ))}
              </div>
              <ul className="flex flex-col gap-3 text-sm">
                {stats.statuses.map((one) => (
                  <li key={one.status} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-base-content/70">
                      <span aria-hidden="true" className={`size-2 rounded-full ${DOTS[one.status]}`} />
                      {t(`status.${one.status}`)}
                    </span>
                    <span className="font-medium tabular-nums">
                      {format(one.count, 'number')}
                      <span className="ms-2 text-base-content/70">
                        {format(all === 0 ? 0 : one.count / all, 'percent')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-base-300 pt-4">
                <h3 className={label}>{t('overview.best')}</h3>
                <ul className="mt-3 flex flex-col gap-3">
                  {stats.buyers.map((buyer) => (
                    <li key={buyer.name} className="flex flex-col gap-1.5">
                      <span className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{buyer.name}</span>
                        <span className="font-medium tabular-nums">{format(buyer.total, 'currency')}</span>
                      </span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-base-200" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${(buyer.total / best) * 100}%` }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>

        <Card
          title={t('overview.newest')}
          aside={
            <Link
              to="/orders"
              className="link link-primary link-hover inline-flex items-center gap-1 text-sm font-medium"
            >
              {t('overview.all')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className={table.frame}>
              <tbody>
                {newest.slice(0, 5).map((o) => (
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
        </Card>
      </>
    )
  },
})
