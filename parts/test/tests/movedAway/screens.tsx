import { useState } from 'react'
import { Form, Link, screen } from 'tentjs/ui'
import { slowSave } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/home',
  access: 'anyone',
  title: 'Home',
  view: () => (
    <main>
      <h1>Home</h1>
      <Form call={slowSave} then={{ goTo: '/done' }} id="save">
        <button type="submit">Save</button>
      </Form>
      <Link to="/items/7" id="elsewhere">
        Elsewhere
      </Link>
      <Link to="/side" above={{ side: 'end' }} id="atEnd">
        Open at the end
      </Link>
    </main>
  ),
})

export const sideScreen = screen('sideScreen', {
  path: '/side',
  access: 'anyone',
  title: 'Side',
  view: () => (
    <main style={{ width: 200 }}>
      <h1>Side</h1>
    </main>
  ),
})

export const doneScreen = screen('doneScreen', {
  path: '/done',
  access: 'anyone',
  title: 'Done',
  view: () => (
    <main>
      <h1>Done</h1>
    </main>
  ),
})

// A screen whose view fails in the browser at a press.
export const itemScreen = screen('itemScreen', {
  path: '/items/:id',
  access: 'anyone',
  title: 'Item',
  view: () => {
    const [broken, setBroken] = useState(false)
    if (broken) throw new Error('the view broke at a press')
    return (
      <main>
        <h1>Item</h1>
        <button type="button" onClick={() => setBroken(true)}>
          Break
        </button>
      </main>
    )
  },
})

// The project's own error screen: it shows the values of the address of the screen that failed.
export const failedScreen = screen('failedScreen', {
  for: 'error',
  access: 'anyone',
  title: 'Failed',
  view: ({ params }) => (
    <main>
      <h1>Failed at {params.id ?? 'none'}</h1>
    </main>
  ),
})
