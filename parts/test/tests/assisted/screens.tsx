import { screen, read, useAgent, useParams, Form } from 'tentjs/ui'
import { helper } from './functions'

// A screen written in code: the conversation of its address, with the answer as it is written and each ask.
export const chatScreen = screen('chatScreen', {
  path: '/chat/:chat',
  access: 'signedIn',
  view: () => {
    const { chat } = useParams()
    const a = useAgent(helper, { thread: String(chat) })
    return (
      <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1>State {a.state}</h1>
        <p id="answer">Answer: {a.answer}</p>
        <button type="button" onClick={() => void a.send('Hello there.')}>
          Say hello
        </button>
        <button type="button" onClick={() => void a.send('Please refund it.')}>
          Ask for a refund
        </button>
        {a.asks.map((ask) => (
          <button key={`${ask.run} ${ask.step}`} type="button" onClick={() => void a.approve(ask)}>
            Yes to {ask.tool}
          </button>
        ))}
      </main>
    )
  },
})

// A form starts the agent, and `working` shows what it writes.
export const formScreen = screen('formScreen', {
  path: '/form',
  access: 'signedIn',
  data: { working: read(helper.working, {}) },
  view: ({ working }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Form call={helper}>
        <textarea name="message" />
        <button type="submit">Send</button>
      </Form>
      {working.map((entry, place) => <span key={place}>Working: {entry.state} {entry.text}</span>)}
    </main>
  ),
})
