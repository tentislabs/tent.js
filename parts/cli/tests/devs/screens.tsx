import { useEffect } from 'react'
import { screen, read, text, Form } from 'tentjs/ui'
import { addItem, allItems, stamp } from './functions'

// A screen, with a state that its address keeps.
export const listScreen = screen('listScreen', {
  path: '/',
  access: 'anyone',
  state: { tab: { type: text({ default: 'all' }), in: 'address' } },
  data: { items: read(allItems) },
  view: ({ items, state }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>The first heading</h1>
      <span>tab {state.tab}</span>
      <span>{items.length} items</span>
      {items.map((item, place) => <span key={place}>{item.title}</span>)}
      <Form call={addItem} with={{ title: 'pressed' }}><button type="submit">
        Add one
      </button></Form>
      <Form call={stamp}><button type="submit">Stamp</button></Form>
    </main>
  ),
})

// A view that asks for a script of another host: the content policy of the page blocks it.
export const outsideScreen = screen('outsideScreen', {
  path: '/outside',
  access: 'anyone',
  view: () => {
    useEffect(() => {
      const script = document.createElement('script')
      script.src = 'http://localhost:9/outside.js'
      document.head.append(script)
    }, [])
    return <h1>Outside</h1>
  },
})
