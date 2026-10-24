# `seo` of `screen`

What search engines and shared links are told of the screen.

## Value

A record of `description`, `image`, `index`, `data` and `addresses`. `description` is text, or an arrow over what the view is handed, which stands after `data` in the record: the type checker reads the record from its top, so an arrow above `data` is handed none of its names (`option.screen.title`). `image` is an asset or an address, or an arrow that gives one; or `{ view, size? }`, a component that the engine draws into the picture of a shared link, handed the screen's answers, at `[1200, 630]` where `size` is left out. Such a picture is answered at `/_t/seo/image/<screen>?<an address of the screen>`: drawn as nobody in the hidden browser of `tent shot` at its first request, and kept until a write changes what it was drawn from, at most `limits.seoImagesPerMinute` (30) a minute for the app, one at a time; the head names it with its size. Only a screen open to anyone, whose own entries are too, may draw one. `index: false` asks search engines to leave the page out. `data` is structured data as any JSON. `addresses` is a `read(query)`, for a screen whose address has values: the sitemap lists the screen once for each row.

The app answers `/sitemap.xml` with every screen that anyone may see and that does not say `index: false`, each written with the address the app was reached by: a screen with values in its address once for each row of `addresses`, and one with values and no `addresses` not at all. Past 50,000 addresses it is a list of `/sitemap-1.xml`, `/sitemap-2.xml` and so on. `/robots.txt` lets everything be read on live data and names the sitemap; in the modes `development` and `test` it lets nothing be read. The head of each page names its one address, `<link rel="canonical">`, written with the address the app was reached by. In an app of several languages it names the same screen in every language, itself among them, one `<link rel="alternate" hreflang="<code>">` for each, then the screen in the default language as `hreflang="x-default"`: in an app of `en` and `tr`, both `/pricing` and `/tr/pricing` name `/pricing` as `en`, `/tr/pricing` as `tr`, and `/pricing` as `x-default` (`option.project.languages`).

## Example

```tsx
import { screen, asset } from 'tentjs/ui'

export const ordersScreen = screen('ordersScreen', {
  path: '/prices',
  access: 'anyone',
  seo: { description: 'What each plan costs.', image: asset('prices.png') },
  view: () => <h1>Prices</h1>,
})
```

## Errors

`code.T1003`: a name that `seo` does not have. `code.T6032`: a picture drawn of a component for a screen that is not open to anyone.

## See also

`word.screen`
