# `message`

Names a message of the language files by its key, so that it reads in the language of its page.

## Example

```tsx
<h1>{message('orders.title')}</h1>
<p>{message('orders.count', { count: orders.length })}</p>
<span>{message(['status', o.status])}</span>
```

```ts
note: text({ label: message('orders.note') })
```

A view draws a message wherever it stands among the children of an element, in the language of the page. A property of a component that is declared `text()` takes it too. So do `title` and the search-engine fields of a screen, and `label` and `help` of a type, in a backend file, where `message` comes from `tentjs`: a field that a `Form` fills is labelled by it through `useField`. Where the code of a view needs the text itself, as for an attribute, it reads it with `t` of `useTranslations`. Wherever such a type leaves the engine for a program, the message is written as its text in the default language.

The places in curly brackets of the text are filled from the values. A message with plural forms takes the form of `count` by the rules of the language, and the form `zero` for 0 where it gives one. A key that is built from a value is written as a list of its parts, joined with dots: `['status', 'paid']` is `status.paid`.

## Returns

The record `{ message: 'orders.note' }`, and with values `{ message, with }`.

## See also

`topic.words`, `option.project.languages`, `hook.useTranslations`, `word.messages`, `code.T9003`
