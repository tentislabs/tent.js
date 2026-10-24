import { screen, read, asset, Link } from 'tentjs/ui'
import { productBySlug, productSlugs } from './functions'

export const homeScreen = screen('homeScreen', {
  path: '/',
  access: 'anyone',
  title: 'The shop',
  seo: { description: 'Chairs and lamps' },
  data: { all: read(productSlugs) },
  view: ({ all }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>The shop</h1>
      {all.map((o) => <Link key={o.slug} to={'/products/' + o.slug} id="open">{o.name}</Link>)}
    </main>
  ),
})

export const productScreen = screen('productScreen', {
  path: '/products/:slug',
  access: 'anyone',
  title: ({ product }) => product.name,
  head: [{ meta: { property: 'og:type', content: 'product' } }, { script: { src: asset('widget.js'), async: true } }],
  seo: {
    description: ({ product }) => product.summary,
    image: asset('icon.svg'),
    data: ({ product }) => ({ '@type': 'Product', name: product.name }),
    addresses: read(productSlugs),
  },
  data: ({ params }) => ({ product: read(productBySlug, { slug: params.slug }, { needed: true }) }),
  view: ({ product }) => <h1>{product.name}</h1>,
})

export const hiddenScreen = screen('hiddenScreen', {
  path: '/hidden',
  access: 'anyone',
  title: 'Hidden',
  seo: { index: false },
  view: () => <h1>Hidden</h1>,
})

export const staffScreen = screen('staffScreen', {
  path: '/staff',
  access: 'signedIn',
  title: 'Staff',
  view: () => <h1>Staff</h1>,
})

export const pickedScreen = screen('pickedScreen', {
  path: '/picked/:id',
  access: 'anyone',
  title: 'Picked',
  view: ({ params }) => <h1>Picked {params.id}</h1>,
})
