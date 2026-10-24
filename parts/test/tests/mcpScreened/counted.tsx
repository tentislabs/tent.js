import { useState } from 'react'
import { screen, read } from 'tentjs/ui'
import { openOrders } from './functions'

// A screen that is offered to MCP: its view keeps a state of React of its own, which the build packs into
// the screen's one file.
export const countedScreen = screen('countedScreen', {
  path: '/counted',
  access: 'signedIn',
  about: 'The orders of the person, counted by code',
  offer: ['mcp'],
  data: { orders: read(openOrders) },
  view: ({ orders }) => {
    const [pressed, setPressed] = useState(0)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
        <h1>{`${orders.length} counted`}</h1>
        <button type="button" onClick={() => setPressed(pressed + 1)}>
          {`Pressed ${pressed}`}
        </button>
      </div>
    )
  },
})
