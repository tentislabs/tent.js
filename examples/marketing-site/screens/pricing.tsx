import { anyone, choice, Link, screen, useTranslations, message } from 'tentjs/ui'
import { SiteFrame } from '../components/SiteFrame'
import './pricing.css'

/** Money is a whole number of cents; a year costs ten months. */
const plans = [
  { key: 'starter', monthly: 900 },
  { key: 'pro', monthly: 2900 },
  { key: 'business', monthly: 7900 },
] as const

export const pricingScreen = screen('pricingScreen', {
  path: '/pricing',
  title: message('pricing.title'),
  access: anyone('the prices are for every visitor'),
  layout: SiteFrame,
  seo: { description: message('pricing.description') },
  state: {
    period: { type: choice(['monthly', 'yearly'], { default: 'monthly' }), in: 'address' },
    plan: { type: choice(['starter', 'pro', 'business'], { default: 'pro' }), in: 'address' },
  },
  view: ({ state }) => {
    const { t, format } = useTranslations()
    const yearly = state.period === 'yearly'
    return (
      <main className="pricing">
        <h1>{message('pricing.title')}</h1>
        <p className="lead">{message('pricing.lead')}</p>
        <div className="period">
          <span aria-hidden="true" className={yearly ? '' : 'on'}>
            {message('pricing.monthly')}
          </span>
          <Link
            set={{ period: yearly ? 'monthly' : 'yearly' }}
            role="switch"
            aria-checked={yearly}
            aria-label={t('pricing.switch')}
            className="switch"
          >
            <span className="knob" />
          </Link>
          <span aria-hidden="true" className={yearly ? 'on' : ''}>
            {message('pricing.yearly')}
          </span>
        </div>
        <p className="saving">{message('pricing.saving')}</p>
        <ul className="plans">
          {plans.map((plan) => {
            const chosen = state.plan === plan.key
            const name = t(`pricing.${plan.key}`)
            return (
              <li key={plan.key} className={chosen ? 'plan chosen' : 'plan'} data-plan={plan.key}>
                <h2>{name}</h2>
                <p className="price">
                  <strong>{format(yearly ? plan.monthly * 10 : plan.monthly, 'currency')}</strong>{' '}
                  <span>{t(yearly ? 'pricing.perYear' : 'pricing.perMonth')}</span>
                </p>
                <p className="about">{t(`pricing.${plan.key}About`)}</p>
                {chosen ? (
                  <p className="badge">{message('pricing.chosen')}</p>
                ) : (
                  <Link set={{ plan: plan.key }} keep className="button choose">
                    {t('pricing.choose', { plan: name })}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </main>
    )
  },
})
