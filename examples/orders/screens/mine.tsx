import { ShoppingBag } from 'lucide-react'
import { Link, read, screen, useTranslations } from 'tentjs/ui'
import { CustomerFrame, Waiting } from '../components/frames'
import { Badge, Card, DOTS, Empty, PageHeader, Stat, table } from '../components/ui'
import { myOrders } from '../functions/orders'
import { orderScreen } from './order'

export const mineScreen = screen('mineScreen', {
  path: '/mine',
  title: 'My orders',
  access: 'signedIn',
  layout: CustomerFrame,
  loading: Waiting,
  data: { orders: read(myOrders) },
  view: ({ orders }) => {
    const { t, format } = useTranslations()
    const open = orders.filter((o) => o.status === 'open')
    const spent = orders.filter((o) => o.status !== 'open').reduce((sum, o) => sum + o.total, 0)
    return (
      <>
        <PageHeader title={t('mine.title')} lead={t('mine.lead')} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Stat label={t('mine.orders')} value={format(orders.length, 'number')} />
          <Stat label={t('mine.open')} value={format(open.length, 'number')} dot={DOTS.open} />
          <div className="col-span-2 sm:col-span-1">
            <Stat label={t('mine.spent')} value={format(spent, 'currency')} />
          </div>
        </div>
        <Card>
          {orders.length === 0 ? (
            <Empty icon={<ShoppingBag aria-hidden="true" className="size-5" />} title={t('mine.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className={table.frame}>
                <thead className={table.head}>
                  <tr>
                    <th scope="col" className={table.th}>
                      {t('orders.placed')}
                    </th>
                    <th scope="col" className={table.th}>
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
                        <Link to={orderScreen} with={{ id: o.id }} className={`${table.cover} tabular-nums`}>
                          {format(o.placedAt, 'date')}
                        </Link>
                      </td>
                      <td className={table.td}>
                        <Badge tone={o.status}>{t(`status.${o.status}`)}</Badge>
                      </td>
                      <td className={`${table.td} text-end font-medium tabular-nums`}>{format(o.total, 'currency')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    )
  },
})
