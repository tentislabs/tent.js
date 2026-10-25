import { Form, Link, read, role, screen, useTranslations } from 'tentjs/ui'
import { StaffFrame, Waiting } from '../components/frames'
import { Labelled, MoneyField } from '../components/Labelled'
import { button, Card, PageHeader } from '../components/ui'
import { customerList } from '../functions/customers'
import { addOrder } from '../functions/orders'
import { ordersScreen } from './orders'

export const newOrderScreen = screen('newOrderScreen', {
  path: '/orders/new',
  title: 'New order',
  access: role('staff'),
  layout: StaffFrame,
  loading: Waiting,
  data: { customers: read(customerList) },
  view: ({ customers, calls }) => {
    const { t } = useTranslations()
    return (
      <>
        <PageHeader title={t('newOrder.title')} lead={t('newOrder.lead')} />
        <Card className="max-w-xl">
          <Form
            id="add"
            call={addOrder}
            then={{ goTo: ordersScreen }}
            aria-label={t('newOrder.title')}
            className="flex flex-col gap-5 p-5 sm:p-6"
          >
            <Labelled name="customer" label={t('newOrder.customer')} control="select">
              <option value="">{t('newOrder.pick')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Labelled>
            <MoneyField name="total" label={t('newOrder.total')} />
            <Labelled name="note" label={t('newOrder.note')} hint={t('newOrder.noteHint')} control="textarea" />
            <div className="flex items-center gap-3 border-t border-base-300 pt-5">
              <button type="submit" className={button.primary} disabled={calls.add?.busy}>
                {calls.add?.busy && <span aria-hidden="true" className="loading loading-spinner loading-sm" />}
                {t('newOrder.add')}
              </button>
              <Link to={ordersScreen} exact className={button.ghost}>
                {t('newOrder.cancel')}
              </Link>
            </div>
          </Form>
        </Card>
      </>
    )
  },
})
