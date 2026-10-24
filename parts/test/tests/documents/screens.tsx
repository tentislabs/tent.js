import { screen, read, Form } from 'tentjs/ui'
import { chatMessages, helper } from './functions'

export const chatScreen = screen('chatScreen', {
  path: '/chats/:id',
  title: 'Ask the documents',
  access: 'signedIn',
  data: ({ params }) => ({
    messages: read(chatMessages, { chat: params.id }),
    working: read(helper.working, { thread: params.id }),
  }),
  view: ({ messages, working, params }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      {messages.map((m, place) => <span key={place}>{m.text}</span>)}
      {working.length > 0 ? <>
        <span style={{ color: '#5f6672' }}>{working[0]?.text ?? 'Working...'}</span>
      </> : null}
      <Form id="ask" call={helper} with={{ thread: params.id }}>
        <label>
          Your question <input name="message" />
        </label>
      </Form>
    </div>
  ),
})
