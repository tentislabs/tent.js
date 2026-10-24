# `Image`

A picture through the image door: an asset of the project, a file of the app that a user uploaded, or a picture on a host that the project lists, drawn as one `<img>` in the widths the door answers.

## Example

```tsx
import { screen, asset, read, Image } from 'tentjs/ui'
import { allProducts } from '../functions/products'

export const shopScreen = screen('shopScreen', {
  path: '/shop',
  access: 'anyone',
  data: { products: read(allProducts) },
  view: ({ products }) => (
    <main>
      <Image src={asset('banner.jpg')} alt="Our shop by the sea" sizes="100vw" priority />
      <ul className="products">
        {products.map((p) => (
          <li key={p.id}>
            <Image src={p.photo} alt={p.name} width={240} height={180} sizes="240px" />
          </li>
        ))}
      </ul>
    </main>
  ),
})
```

## Properties

| Property | Does |
|---|---|
| `src` | An asset, `asset('logo.png')`, or `asset(p.picture)` for a name that a row holds; the id of a file of the app; or an address that starts with `https://` or `http://` on a host that `project.hosts` lists. Any other text is a file id |
| `alt` | Required: what the picture shows, for a screen reader. `alt=""` says that it only decorates |
| `width`, `height` | Its size in pixels. For an asset they are taken from its file where they are left out |
| `sizes` | How wide it is drawn, as the browser reads it: `'100vw'` when left out. The browser picks the width it asks for by it |
| `priority` | It loads with the page and is named in the head, for the main picture of a screen. Without it a picture loads when it is near the view |

Every other property of an `<img>` reaches it: `className`, `style`, `title`. How it fills its box is `object-fit` and `object-position` of the project's CSS.

**What it draws.** A picture of the app is asked for through the image door, `/_t/img/`, in each of its widths - the six that ship, or the project's own `images.widths` - and the door answers a smaller format where the browser takes one. Until a picture from a file or an asset has loaded, its tiny blurred copy is its background, where the engine has one. In a page that `tent export` wrote, it is a `<picture>` of the files that were written.

**What it does not load.** A picture on a host that `project.hosts` does not list is not loaded: the `<img>` has no address. An asset whose name no file of the bundle has draws nothing.

**Its size should be known before it loads**, so that the page does not jump when it arrives. For an asset the size comes from its file. For a file id and an address it is the builder's to write: an `Image` whose `src`, written in place, is no asset, and that states neither `width` nor `height`, is a warning (`code.T6025`).

## Errors

`code.T6025`: the size of the picture is not known. `code.T6013`: a `src` written in place that is no allowed address.

## See also

`word.asset`, `tag.Link`, `topic.screens`
