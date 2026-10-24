import { useState } from 'react'
import { component } from 'tentjs/ui'

export const Badge = component('Badge', {
  view: () => {
    const [clicks, setClicks] = useState(0)
    return (
      <button id="badge" type="button" onClick={() => setClicks(clicks + 1)}>
        Badge first {clicks}
      </button>
    )
  },
})
