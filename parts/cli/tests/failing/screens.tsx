import { useState } from 'react'
import { screen, Form } from 'tentjs/ui'
import { explode } from './functions'

// What a test switches on by a save: the view on the server throws as it draws.
const serverBreaks = false

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  view: () => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>Home</h1>
      <Form call={explode}><button type="submit">Explode</button></Form>
    </main>
  ),
})

// A view that throws as it draws, wherever it is drawn, while it breaks.
export const serverScreen = screen('serverScreen', {
  path: '/server',
  access: 'anyone',
  view: () => {
    if (serverBreaks) throw new Error('The view broke on the server')
    return <h1>Whole on the server</h1>
  },
})

// A view that throws as it draws in the browser, once it is pressed.
export const browserScreen = screen('browserScreen', {
  path: '/browser',
  access: 'anyone',
  view: () => {
    const [pressed, press] = useState(false)
    if (pressed) throw new Error('The view broke in the browser')
    return (
      <button type="button" onClick={() => press(true)}>
        Break it
      </button>
    )
  },
})
