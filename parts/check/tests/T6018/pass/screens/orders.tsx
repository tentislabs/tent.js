import { component } from 'tentjs/ui'

export const Shown = component('Shown', {
  browser: false,
  view: ({ children }) => (
    <section>
      <h2>Shown</h2>
      <a href="https://example.com/help">Help</a>
      {children}
    </section>
  ),
})
