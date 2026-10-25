import { ArrowLeft, Compass } from 'lucide-react'
import { Link, screen, useTranslations } from 'tentjs/ui'
import { PlainFrame } from '../components/frames'
import { button } from '../components/ui'

export const notFoundScreen = screen('notFoundScreen', {
  for: 'notFound',
  title: 'Not found',
  access: 'anyone',
  layout: PlainFrame,
  view: ({ user }) => {
    const { t } = useTranslations()
    const home = user === undefined ? '/sign-in' : user.roles.includes('staff') ? '/' : '/mine'
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Compass aria-hidden="true" className="size-6" />
        </span>
        <p className="text-sm font-semibold text-primary tabular-nums">404</p>
        <h1 tabIndex={-1} className="text-3xl font-semibold tracking-tight">
          {t('notFound.title')}
        </h1>
        <p className="max-w-sm text-sm text-base-content/70">{t('notFound.lead')}</p>
        <Link to={home} className={`${button.quiet} mt-2`}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('notFound.home')}
        </Link>
      </main>
    )
  },
})
