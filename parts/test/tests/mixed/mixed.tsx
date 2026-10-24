import { useState } from 'react'
import { louder } from 'tiny-louder'
import { component, text } from 'tentjs/ui'
import { shout } from './shout'

// A helper of the file that only the part drawn on the server alone uses: no browser file may hold it.
const besideHidden = 'The marker beside the hidden part'

// A part that lives in the browser, in the same file as a part drawn on the server alone.
export const Shown = component('Shown', {
  props: { label: text() },
  view: ({ label }) => {
    const [count, setCount] = useState(0)
    return (
      <button type="button" id="shown" onClick={() => setCount(count + 1)}>
        The words of the shown part, {label} {count}
      </button>
    )
  },
})

// The marker above the hidden part: a part drawn on the server alone, with a helper of its file, a file and a package.
export const Hidden = component('Hidden', {
  browser: false,
  props: { said: text() },
  view: ({ said }) => (
    <div id="hidden">
      <span>The marker of the hidden view</span>
      <span>{shout(said)}</span>
      <span>{besideHidden}</span>
      <span>{louder(said)}</span>
    </div>
  ),
})
