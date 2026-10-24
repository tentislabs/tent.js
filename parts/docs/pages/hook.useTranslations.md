# `useTranslations`

Reads the messages of the language files in the code of a view, and writes a value as the engine knows to write it: in the language of the page, in the viewer's zone, money in the project's currency.

## Example

```tsx
import { screen, read, useTranslations } from 'tentjs/ui'
import { getOrder } from '../functions/orders'

export const orderScreen = screen('orderScreen', {
  path: '/orders/:id',
  access: 'signedIn',
  data: ({ params }) => ({ order: read(getOrder, { id: params.id }, { needed: true }) }),
  view: ({ order, user }) => {
    const { t, format } = useTranslations()
    return (
      <main>
        <h1>{t('greeting', { name: user?.name ?? '' })}</h1>
        <p>
          {format(order.total, 'currency')}, {format(order.createdAt, 'relative')}
        </p>
      </main>
    )
  },
})
```

## Returns

`{ t, format, language, languages, zone }`.

`t(key, values)` is the text of the key in the language of the page, with the places in curly brackets filled from `values`: a number among them is written in the language. A message with plural forms takes the form of `count`. A key that the language lacks shows the message of the default language, and one that no language has shows the key itself.

`format(value, as)` writes a value in the language of the page, the same in the first HTML and in the browser:

| `as` | Writes |
|---|---|
| `'number'` | A number, with `{ digits }` for the digits after the point |
| `'currency'` | Money, a whole number of the smallest unit, in `project.currency`: 1999 with `'USD'` is $19.99. `{ currency: 'EUR' }` names another. A value that is not whole is rounded first |
| `'percent'` | A share of one: 0.5 is 50% |
| `'date'`, `'time'`, `'dateTime'` | The day with the month as a short word and the year; hours and minutes; both. A `date` in the viewer's zone, a `day` with none |
| `'relative'` | The time between the value and now, as "3 days ago" |

`language` is the language of the page, and `languages` those of the project, the default first. `zone` is the time zone the page writes in: the viewer's own, kept in the cookie `tent_zone`, and `project.zone` in the first HTML of a first visit, after which the page corrects the times it shows.

## Errors

`code.T6021`: `'currency'` handed to `format` in place in a project that states no `currency`.

## See also

`word.message`, `word.messages`, `option.project.languages`, `option.project.currency`, `option.project.zone`
