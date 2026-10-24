import { screen, text, Form } from 'tentjs/ui'
import { welcome } from './flows.ts'

// A form over a flow: its named controls are fields of the flow's `input`, and `then` is handed the flow's answer.
export const welcomeScreen = screen('welcomeScreen', {
  path: '/',
  access: 'anyone',
  state: { greeting: { type: text({ default: 'Nobody was welcomed yet' }) } },
  view: ({ state }) => (
    <main>
      <h1>{state.greeting}</h1>
      <Form id="welcome" call={welcome} then={(answer) => ({ set: { greeting: answer.greeting } })}>
        <label>
          Name <input id="name" name="name" />
        </label>
        <label>
          Guests <input id="guests" name="guests" type="number" min={0} />
        </label>
        <button type="submit" id="send">
          Welcome
        </button>
      </Form>
    </main>
  ),
})
