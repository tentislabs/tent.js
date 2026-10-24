import { component, screen, text } from 'tentjs/ui'

export const Card = component('Card', {
  props: { title: text() },
  view: ({ title }) => <span>{title}</span>,
})

// A screen open to anyone may have a picture for the links to it that are shared.
export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  seo: { image: { view: Card } },
  view: () => (
    <div>
      <span>Home</span>
    </div>
  ),
})
