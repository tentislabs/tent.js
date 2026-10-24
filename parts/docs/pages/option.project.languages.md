# `languages` of `project`

The languages of the app.

## Value

A list of language codes, of which the first is the default. `['en']` when left out.

## Example

```ts
export const shop = project('shop', {
  languages: ['en', 'tr'],
})
```

```ts
// messages/tr.ts
import { messages } from 'tentjs/ui'

export default messages('tr', {
  orders: { title: 'Açık siparişler', count: { one: '{count} sipariş', other: '{count} sipariş' } },
  greeting: 'Merhaba {name}',
})
```

A language file exports `messages(code, messages)` as its default, wherever it lies, with messages only. Several files of one language are joined, and a key that two of them give is `code.T1014`. The messages may be nested, and are named by their names joined with dots: `orders.title`. A message is a text, which may hold places in curly brackets, or a record of the plural forms `zero`, `one`, `two`, `few`, `many` and `other`.

The default language has no code in its addresses, and every other has its code first: `/tr/orders`. A move keeps the language of the page, and `language` of a `Link` beside `to` changes it. A `Link` with `language` alone shows the screen that is open in that language, and is current while the page is in it. A screen's own path never starts with the code of a language (`code.T1014`).

For search engines the head of a page of an app of several languages names the same screen in every language, itself among them, as `<link rel="alternate" hreflang="tr" href="...">`, and the default language as `hreflang="x-default"`, beside its one address (`option.screen.seo`).

The page states its language to the browser, and for a language that is written from right to left that too: sides are named `start` and `end`, so a layout turns with the language. Numbers, dates and money are written in the language of the page.

The messages of a failed check are under fixed keys that start with `tent.`, which a language file may give anew: `tent.required`, `tent.type`, `tent.min`, `tent.max`, `tent.pattern`, `tent.values`, `tent.unknown`, `tent.failed`. A language that does not give one uses the English one. A `fail` of the app's own is shown in the messages under `fail.<code>`, and under a field `failAt.<code>.<field>`, where a language file gives them.

An app with one language needs no language file and no `message`: adding a second language changes the language files and this line, and nothing else. A key that one language lacks is `code.T9001`, and one that no language has `code.T9003`.

## See also

`word.project`, `word.message`, `word.messages`, `hook.useTranslations`
