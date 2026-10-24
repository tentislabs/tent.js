import { UserPlus, Users } from 'lucide-react'
import { Link, read, role, screen, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { Avatar, Badge, button, Card, Empty, PageHeader, table } from '../components/ui'
import { customerList } from '../functions/customers'

export const customersScreen = screen('customersScreen', {
  path: '/customers',
  title: 'Customers',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: { customers: read(customerList) },
  view: ({ customers }) => {
    const { t } = useTranslations()
    return (
      <>
        <PageHeader
          title={t('customers.title')}
          lead={t('customers.lead')}
          actions={
            <Link to="/customers/new" className={button.primary}>
              <UserPlus aria-hidden="true" className="size-4" />
              {t('customers.add')}
            </Link>
          }
        />
        <Card>
          {customers.length === 0 ? (
            <Empty icon={<Users aria-hidden="true" className="size-5" />} title={t('customers.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <table className={table.frame}>
                <thead className={table.head}>
                  <tr>
                    <th scope="col" className={table.th}>
                      {t('customers.name')}
                    </th>
                    <th scope="col" className={`${table.th} hidden sm:table-cell`}>
                      {t('customers.email')}
                    </th>
                    <th scope="col" className={table.th}>
                      {t('customers.tier')}
                    </th>
                    <th scope="col" className={`${table.th} hidden md:table-cell`}>
                      {t('customers.account')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-base-300">
                      <td className={table.td}>
                        <span className="flex items-center gap-3">
                          <Avatar name={c.name} />
                          <span className="font-medium">{c.name}</span>
                        </span>
                      </td>
                      <td className={`${table.td} hidden text-base-content/70 sm:table-cell`}>{c.email}</td>
                      <td className={table.td}>
                        <Badge tone={c.tier}>{t(`tier.${c.tier}`)}</Badge>
                      </td>
                      <td className={`${table.td} hidden text-base-content/70 md:table-cell`}>
                        {c.user ? t('customers.yes') : t('customers.no')}
                      </td>
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
