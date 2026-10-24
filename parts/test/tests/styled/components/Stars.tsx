import { component, number } from 'tentjs/ui'
import './stars.css'

// A component with a style file of its own, which one screen draws and the home screen does not.
export const Stars = component('Stars', {
  props: { count: number() },
  view: ({ count }) => <span className="stars">{'*'.repeat(count)}</span>,
})
