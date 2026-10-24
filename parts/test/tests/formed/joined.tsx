import { screen, read, useField, Form } from 'tentjs/ui'
import { homeOf, join } from './moves'

/** A field that `useField` drives, which shows the words of its failed check under it. */
function Owner(o: { id: string }) {
  const f = useField('owner')
  return (
    <label id={o.id}>
      {f.label} <input {...f.input} />
      {f.error && <span id={f.errorId}>{f.error}</span>}
    </label>
  )
}

export const joinScreen = screen('joinScreen', {
  path: '/join',
  access: 'anyone',
  title: 'Join',
  view: () => (
    <main>
      <Form id="join" call={join} with={{ street: 'Side' }} then={(made) => ({ goTo: '/homes/' + made.owner })}>
        <Owner id="owner" />
        <input id="secret" name="secret" type="password" />
        <input id="city" name="city" />
        <button type="submit" id="send">
          Join
        </button>
      </Form>
      <Form id="other" call={join} reset={['secret']}>
        <Owner id="otherOwner" />
        <input id="otherSecret" name="secret" type="password" />
        <input id="otherCity" name="city" />
        <button type="submit" id="otherSend">
          Join too
        </button>
      </Form>
    </main>
  ),
})

export const oneHomeScreen = screen('oneHomeScreen', {
  path: '/homes/:owner',
  access: 'anyone',
  title: 'A home',
  data: ({ params }) => ({ home: read(homeOf, { owner: params.owner }, { needed: true }) }),
  view: ({ home }) => (
    <h1>
      {home.owner} in {home.address.city} on {home.address.street}
    </h1>
  ),
})
