import { screen, useTranslations, message, Link } from 'tentjs/ui'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: message('home.title'),
  view: () => {
    const { t } = useTranslations()
    return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{t('home.title')}</h1>
      <Link to="/orders" id="open">{t('home.open')}</Link>
    </main>
    )
  },
})

export const ordersScreen = screen('ordersScreen', {
  path: '/orders',
  access: 'anyone',
  title: message('orders.title'),
  view: () => {
    const { t } = useTranslations()
    return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{t('orders.title')}</h1>
      <span id="count">{t('orders.count', { count: 3 })}</span>
    </main>
    )
  },
})

export const aboutScreen = screen('aboutScreen', {
  path: '/about',
  access: 'anyone',
  title: message('about.title'),
  view: () => {
    const { t } = useTranslations()
    return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{t('about.title')}</h1>
      <span id="words">{t('about.words')}</span>
    </main>
    )
  },
})
