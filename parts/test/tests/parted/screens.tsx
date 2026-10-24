import { useState } from 'react'
import { screen, number, role, text, Link } from 'tentjs/ui'
import { Loud } from './loud'
import { Notes, Who } from './parts'

// A screen with a part drawn on the server alone, which wraps a child that lives, and a state that it is given.
export const partedScreen = screen('partedScreen', {
  path: '/parted',
  access: 'anyone',
  state: {
    heading: { type: text({ default: 'Notes' }), in: 'address' },
    count: number({ default: 0 }),
  },
  view: ({ state }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span id="above">Above the part</span>
      <Notes heading={state.heading}>
        <Link set={{ count: state.count + 1 }} id="press">Pressed {state.count}</Link>
      </Notes>
      <Link set={{ heading: 'Renamed' }} id="rename">Rename</Link>
      <Link to="/loud" id="toLoud">Loud</Link>
    </div>
  ),
})

// A view that is code draws a part whose view is code.
export const loudScreen = screen('loudScreen', {
  path: '/loud',
  access: 'anyone',
  view: () => {
    const [said] = useState('hello')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Loud said={said}>
          <Link to="/parted" id="kid">A living child</Link>
        </Loud>
        <Link to="/parted" id="toParted">Back</Link>
      </div>
    )
  },
})

export const whoScreen = screen('whoScreen', { path: '/who', access: 'anyone', view: () => <Who id="nobody" /> })

// A screen that only staff may see, which uses the part too.
export const staffScreen = screen('staffScreen', {
  path: '/staff',
  access: role('staff'),
  view: () => <Notes heading="Staff" />,
})
