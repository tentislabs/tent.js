import '@fontsource-variable/inter'
import '../screens/app.css'
import { LayoutDashboard, LogOut, Package, ShoppingBag, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { component, Form, Link, useTranslations } from 'tentjs/ui'
import { signOut } from '../functions/signIn'
import { button } from './ui'

export function Brand() {
  const { t } = useTranslations()
  return (
    <span className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-content shadow-xs">
        <Package aria-hidden="true" className="size-4" strokeWidth={2.25} />
      </span>
      {t('app.name')}
    </span>
  )
}

export function Languages() {
  const { t } = useTranslations()
  const one = 'join-item btn btn-xs border-base-300 font-medium aria-[current=page]:btn-active'
  return (
    <nav aria-label={t('nav.language')} className="join">
      <Link language="en" lang="en" className={one}>
        English
      </Link>
      <Link language="tr" lang="tr" className={one}>
        Türkçe
      </Link>
    </nav>
  )
}

function SignOut({ className = '' }: { className?: string }) {
  const { t } = useTranslations()
  return (
    <Form call={signOut} then={{ goTo: '/sign-in' }}>
      <button type="submit" className={`${button.ghost} btn-sm ${className}`}>
        <LogOut aria-hidden="true" className="size-4" />
        {t('nav.signOut')}
      </button>
    </Form>
  )
}

function Shell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  const { t } = useTranslations()
  return (
    <div className="min-h-dvh bg-base-200 font-sans text-base-content lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="border-b border-base-300 bg-base-100 lg:border-e lg:border-b-0">
        <div className="flex flex-col gap-3 px-4 pt-3 pb-3 lg:sticky lg:top-0 lg:h-dvh lg:gap-6 lg:py-6">
          <div className="flex items-center justify-between gap-3 px-2">
            <Brand />
            <div className="lg:hidden">
              <Languages />
            </div>
          </div>
          <nav aria-label={t('nav.main')} className="-mx-2 overflow-x-auto lg:mx-0 lg:overflow-visible">
            <ul className="menu menu-horizontal w-max gap-1 p-0 lg:menu-vertical lg:w-full">{nav}</ul>
          </nav>
          <div className="mt-auto hidden flex-col items-start gap-4 px-2 lg:flex">
            <Languages />
            <SignOut className="-ms-3" />
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">{children}</main>
        <div className="flex justify-center pb-8 lg:hidden">
          <SignOut />
        </div>
      </div>
    </div>
  )
}

const item = 'gap-3 font-medium aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary'

function StaffLinks() {
  const { t } = useTranslations()
  return (
    <>
      <li>
        <Link to="/" exact className={item}>
          <LayoutDashboard aria-hidden="true" className="size-4" />
          {t('nav.overview')}
        </Link>
      </li>
      <li>
        <Link to="/orders" className={item}>
          <ShoppingBag aria-hidden="true" className="size-4" />
          {t('nav.orders')}
        </Link>
      </li>
      <li>
        <Link to="/customers" className={item}>
          <Users aria-hidden="true" className="size-4" />
          {t('nav.customers')}
        </Link>
      </li>
    </>
  )
}

function CustomerLinks() {
  const { t } = useTranslations()
  return (
    <li>
      <Link to="/mine" className={item}>
        <ShoppingBag aria-hidden="true" className="size-4" />
        {t('nav.mine')}
      </Link>
    </li>
  )
}

export const StaffFrame = component('StaffFrame', {
  view: ({ children, user }) => (
    <Shell nav={user?.roles.includes('staff') ? <StaffLinks /> : <CustomerLinks />}>{children}</Shell>
  ),
})

export const CustomerFrame = component('CustomerFrame', {
  view: ({ children }) => <Shell nav={<CustomerLinks />}>{children}</Shell>,
})

// The frame of the screens a visitor sees before a sign-in: the page alone, centred.
export const PlainFrame = component('PlainFrame', {
  view: ({ children }) => <div className="min-h-dvh bg-base-200 font-sans text-base-content">{children}</div>,
})

// What a move shows while the next screen waits for its data: the shapes of a heading and a card.
export const Waiting = component('Waiting', {
  view: () => {
    const { t } = useTranslations()
    return (
      <div role="status" aria-label={t('app.loading')} className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
        <div className="skeleton h-80 w-full rounded-box" />
      </div>
    )
  },
})
