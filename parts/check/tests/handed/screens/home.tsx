import { useRef, useState } from 'react'
import { screen } from 'tentjs/ui'

// A view whose elements run the builder's own code: a press, an event of the browser by its name, and an
// element handed through `ref`.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'Home',
  view: () => {
    const [pressed, setPressed] = useState(0)
    const [down, setDown] = useState(0)
    const [tag, setTag] = useState('')
    const box = useRef<HTMLElement | null>(null)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        <button type="button" onClick={() => setPressed((now) => now + 1)} id="pressed" style={{ padding: 8 }}>
          <span>{`Pressed ${pressed}`}</span>
        </button>
        <div id="listened" style={{ padding: 8 }}>
          <span>{`Down ${down}`}</span>
        </div>
        <div id="reffed" ref={box} style={{ padding: 8 }}>
          <span>{`Tag ${tag}`}</span>
        </div>
        <button type="button" onClick={() => setTag(box.current?.tagName.toLowerCase() ?? 'none')} id="tagger">
          Read the tag
        </button>
      </div>
    )
  },
})
