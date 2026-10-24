import { useState } from 'react'
import { screen, read, text } from 'tentjs/ui'
import { word } from 'tiny-words'
import { label } from '../functions/notes'
import { Badge } from '../components/badge'
import { tone } from '../tone'

export const countScreen = screen('countScreen', {
  path: '/count',
  access: 'anyone',
  state: { tab: text({ default: 'one' }) },
  data: { label: read(label) },
  view: ({ label, state, set }) => {
    const [count, setCount] = useState(0)
    return (
      <main>
        <h1 id="title">Title first</h1>
        <p id="label">{label}</p>
        <p id="tab">Tab {state.tab}</p>
        <button id="two" type="button" onClick={() => set({ tab: 'two' })}>
          Two
        </button>
        <button id="add" type="button" onClick={() => setCount(count + 1)}>
          Count {count}
        </button>
        <input id="field" />
        <Badge />
        <p id="tone">{tone}</p>
        <p id="word">{word}</p>
        <div style={{ height: '3000px' }}>Tall</div>
      </main>
    )
  },
})
