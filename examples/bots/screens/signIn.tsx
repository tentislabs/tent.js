import './app.css'
import { anyone, Form, screen, text } from 'tentjs/ui'
import { Face } from '../components/Face'
import { signIn } from '../functions/people'

export const signInScreen = screen('signInScreen', {
  path: '/sign-in',
  title: 'Sign in',
  access: anyone('the way in is open to every visitor'),
  state: { back: { type: text({ default: '/bots' }), in: 'address' } },
  view: ({ state }) => (
    <main className="sign-in">
      <Form call={signIn} then={{ goTo: `/${state.back.replace(/^\/+/, '')}` }} aria-label="Sign in">
        <Face shape="round" colour="white" size={72} />
        <h1>Sign in to bots</h1>
        <label className="field">
          Email
          <input name="email" type="email" autoComplete="username" />
        </label>
        <label className="field">
          Password
          <input name="password" type="password" autoComplete="current-password" />
        </label>
        <button type="submit" className="light">
          Sign in
        </button>
      </Form>
    </main>
  ),
})
