import { Form, Link, role, screen, useTranslations } from 'tentjs/ui'
import { StaffFrame } from '../components/frames'
import { Labelled } from '../components/Labelled'
import { button, Card, PageHeader } from '../components/ui'
import { addCustomer } from '../functions/customers'
import { customersScreen } from './customers'

export const newCustomerScreen = screen('newCustomerScreen', {
  path: '/customers/new',
  title: 'New customer',
  access: role('staff'),
  layout: StaffFrame,
  view: ({ calls }) => {
    const { t } = useTranslations()
    return (
      <>
        <PageHeader title={t('newCustomer.title')} lead={t('newCustomer.lead')} />
        <Card className="max-w-xl">
          <Form
            id="add"
            call={addCustomer}
            then={{ goTo: customersScreen }}
            aria-label={t('newCustomer.title')}
            className="flex flex-col gap-5 p-5 sm:p-6"
          >
            <Labelled name="name" label={t('newCustomer.name')} autoComplete="off" />
            <Labelled name="email" label={t('newCustomer.email')} type="email" autoComplete="off" />
            <Labelled name="tier" label={t('newCustomer.tier')} control="select">
              <option value="standard">{t('tier.standard')}</option>
              <option value="gold">{t('tier.gold')}</option>
            </Labelled>
            <div className="flex items-center gap-3 border-t border-base-300 pt-5">
              <button type="submit" className={button.primary} disabled={calls.add?.busy}>
                {calls.add?.busy && <span aria-hidden="true" className="loading loading-spinner loading-sm" />}
                {t('newCustomer.add')}
              </button>
              <Link to={customersScreen} exact className={button.ghost}>
                {t('newCustomer.cancel')}
              </Link>
            </div>
          </Form>
        </Card>
      </>
    )
  },
})
