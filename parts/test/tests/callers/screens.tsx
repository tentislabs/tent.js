import { screen, read, Form } from 'tentjs/ui'
import { signIn, signOut, whoAmI } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  data: { who: read(whoAmI) },
  view: ({ who, user }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{user ? `Signed in as ${user.id}` : 'A visitor'}</h1>
      <span>The door says {who}</span>
      <Form id="in" call={signIn}>
        <input name="email" />
        <button type="submit">Sign in</button>
      </Form>
      <Form id="out" call={signOut}>
        <button type="submit">Sign out</button>
      </Form>
    </main>
  ),
})

export const accountScreen = screen('accountScreen', {
  path: '/account',
  access: 'signedIn',
  view: ({ user }) => <h1>Account of {user.id}</h1>,
})
