import { component, object, read, screen, text } from 'tentjs/ui'
import { productById } from './functions'

// The picture of a product for a shared link: its color fills it, so a picture shows the row of its address.
export const ProductPreview = component('ProductPreview', {
  props: { one: object({ title: text(), color: text() }) },
  view: ({ one }) => (
    <div style={{ padding: 32, width: '100%', height: '100%', background: one.color }}>
      <span style={{ fontSize: 40 }}>{one.title}</span>
    </div>
  ),
})

export const productScreen = screen('productScreen', {
  path: '/products/:id',
  access: 'anyone',
  title: 'A product',
  seo: { description: 'A product of the shop', image: { view: ProductPreview, size: [600, 315] } },
  data: ({ params }) => ({ one: read(productById, { id: params.id }, { needed: true }) }),
  view: ({ one }) => <h1>{one.title}</h1>,
})

// A screen whose shared links have no picture drawn.
export const aboutScreen = screen('aboutScreen', {
  path: '/about',
  access: 'anyone',
  title: 'About',
  view: () => <h1>About the shop</h1>,
})
