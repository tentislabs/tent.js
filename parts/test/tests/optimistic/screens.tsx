import { useEffect } from 'react'
import { screen, read, optimistic, useCall, useQuery, Form } from 'tentjs/ui'
import { addLater, addTodo, drop, finish, inbox, inboxCount, later, staffAdd } from './functions'

// Two lists and a count, and presses that change them: each change is shown before the engine answers it.
export const todosScreen = screen('todosScreen', {
  path: '/todos',
  access: 'anyone',
  title: 'Todos',
  data: { open: read(inbox), saved: read(later), count: read(inboxCount) },
  view: ({ open, saved, count, calls }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{count} in the inbox</h1>
      <div id="inbox" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {open.map((o) => (
            <div key={o.id} id="row" data-optimistic={optimistic(o) ? '' : undefined} style={{ display: 'flex', gap: 8 }}>
              <span id="title">{o.done ? `${o.title} (done)` : o.title}</span>
              <Form call={finish} with={{ todo: o.id }}><button type="submit">{`Finish ${o.title}`}</button></Form>
              <Form call={drop} with={{ todo: o.id }}><button type="submit">{`Drop ${o.title}`}</button></Form>
            </div>
          ))}
      </div>
      <div id="later" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {saved.map((o) => <span key={o.id}>{o.title}</span>)}
      </div>
      <Form call={addTodo} with={{ title: 'Bananas', box: 'inbox' }} id="add"><button type="submit">
        Add bananas
      </button></Form>
      <Form call={staffAdd} with={{ title: 'Dates' }} id="staff"><button type="submit">
        {calls.staff.error ? `Refused ${calls.staff.error.code}` : 'Add dates as staff'}
      </button></Form>
      <Form call={addLater} with={{ title: 'Figs' }} id="action"><button type="submit">
        Add figs by an action
      </button></Form>
    </main>
  ),
})

// A view: a call that states `optimistic: false` shows nothing ahead, and one with its own `optimistic` shows what it
// answers. Its calls are handed to the test through the window.
export const codeScreen = screen('codeScreen', {
  path: '/code',
  access: 'anyone',
  title: 'Code',
  view: () => {
    const found = useQuery(inbox)
    const quiet = useCall(addTodo, { optimistic: false })
    const shown = useCall(addTodo, {
      optimistic: {
        query: inbox,
        to: (rows, given) => [...rows, { ...rows[0], id: 'optimistic', title: `${given.title}!` }],
      },
    })
    useEffect(() => {
      Object.assign(window, { quietAdd: quiet.call, optimisticAdd: shown.call })
    })
    return (
      <main>
        <h1>{(found.value ?? []).length} shown</h1>
        {(found.value ?? []).map((o) => <span key={o.id}>{o.title}</span>)}
      </main>
    )
  },
})
