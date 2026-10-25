import { MailCheck } from 'lucide-react'
import { anyone, Form, screen, text } from 'tentjs/ui'
import { LoneFrame } from '../components/frames'
import { sendCode, signInWithCode } from '../functions/signIn'

const field = 'flex flex-col gap-1.5 text-sm font-medium'

export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  title: 'Sign in',
  access: anyone('the way in is open to every visitor'),
  layout: LoneFrame,
  state: {
    back: { type: text({ default: '/tickets' }), in: 'address' },
    // The email the code went to, kept in the address so that a page with no script asks for it once too.
    mailedTo: { type: text({ optional: true, max: 254 }), in: 'address' },
  },
  view: ({ state, calls, set }) => (
    <section className="rounded-box border border-base-300 bg-base-100 p-6 sm:p-8" aria-label="Sign in">
      {state.mailedTo === undefined ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-base-content/70">
              We mail you a code of six digits. It works for ten minutes.
            </p>
          </div>
          <Form
            id="code"
            call={sendCode}
            aria-label="Ask for a code"
            then={(sent) => ({ set: { mailedTo: sent.email } })}
            className="space-y-4"
          >
            <label className={field}>
              Email
              <input
                name="email"
                type="email"
                className="input w-full"
                autoComplete="username"
                placeholder="you@example.com"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={calls.code.busy}>
              {calls.code.busy && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
              Mail me a code
            </button>
          </Form>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <span
              className="mb-4 grid size-10 place-items-center rounded-full bg-accent text-accent-content"
              aria-hidden="true"
            >
              <MailCheck className="size-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">Check your mail</h1>
            <p className="mt-1 text-sm text-base-content/70" role="status">
              We mailed a code to <b className="font-medium text-base-content">{state.mailedTo}</b>.
            </p>
          </div>
          <Form
            id="signIn"
            call={signInWithCode}
            aria-label="Sign in with the code"
            with={{ email: state.mailedTo }}
            then={{ goTo: `/${state.back.replace(/^\/+/, '')}` }}
            className="space-y-4"
          >
            <label className={field}>
              Code
              <input
                name="code"
                className="input w-full font-mono tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </label>
            <button type="submit" className="btn btn-primary w-full" disabled={calls.signIn.busy}>
              {calls.signIn.busy && <span className="loading loading-spinner loading-sm" aria-hidden="true" />}
              Sign in
            </button>
          </Form>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 pt-4 text-sm">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ mailedTo: undefined })}>
              Use another email
            </button>
            <Form id="again" call={sendCode} with={{ email: state.mailedTo }}>
              <button type="submit" className="btn btn-ghost btn-sm" disabled={calls.again.busy}>
                {calls.again.value !== undefined ? 'Sent again' : 'Mail me another code'}
              </button>
            </Form>
          </div>
        </div>
      )}
    </section>
  ),
})
