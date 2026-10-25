import { anyone, Form, screen, text, useTranslations } from 'tentjs/ui'
import { Brand, Languages, PlainFrame } from '../components/frames'
import { Labelled } from '../components/Labelled'
import { button } from '../components/ui'
import { signIn } from '../functions/signIn'

// Where a person goes once signed in: back where they came from, or else to the start of what is theirs.
const after = (back: string, staff: boolean): `/${string}` =>
  back ? `/${back.replace(/^\/+/, '')}` : staff ? '/' : '/mine'

export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  title: 'Sign in',
  access: anyone('the way in is open to every visitor'),
  layout: PlainFrame,
  state: { back: { type: text({ default: '', max: 500 }), in: 'address' } },
  view: ({ state, calls }) => {
    const { t } = useTranslations()
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
        <Brand />
        <div className="card w-full max-w-sm border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-0 p-6 sm:p-8">
            <h1 tabIndex={-1} className="text-xl font-semibold tracking-tight">
              {t('signIn.title')}
            </h1>
            <p className="mt-1 text-sm text-base-content/70">{t('signIn.lead')}</p>
            <Form
              id="signIn"
              call={signIn}
              then={(answer) => ({ goTo: after(state.back, answer.staff) })}
              reset={['password']}
              aria-label={t('signIn.title')}
              className="mt-6 flex flex-col gap-4"
            >
              <Labelled name="email" label={t('signIn.email')} type="email" autoComplete="username" />
              <Labelled name="password" label={t('signIn.password')} autoComplete="current-password" />
              <button type="submit" className={`${button.primary} mt-2 w-full`} disabled={calls.signIn?.busy}>
                {calls.signIn?.busy && <span aria-hidden="true" className="loading loading-spinner loading-sm" />}
                {t('signIn.send')}
              </button>
            </Form>
          </div>
        </div>
        <Languages />
      </main>
    )
  },
})
