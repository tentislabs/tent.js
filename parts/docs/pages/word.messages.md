# `messages`

Gives the messages of one language: what a language file exports as its default, wherever the file lies in the project.

## Example

```ts
// messages/en.ts
import { messages } from 'tentjs/ui'

export default messages('en', {
  orders: { title: 'Open orders', count: { one: '{count} order', other: '{count} orders' } },
  greeting: 'Hello {name}',
})
```

The first value is the code of a language that `project.languages` names, and the second its messages. A message is a text, which may hold places in curly brackets, or a record of plural forms under the standard names `zero`, `one`, `two`, `few`, `many` and `other`. A record of other names holds more messages: they are stored under their names joined with dots, so the title above is `orders.title`, which `message('orders.title')` names. The build finds a language file by this call, and several files of one language are joined into one. The folder `messages/` is a habit, not a rule: a language file may lie anywhere in the project.

## Returns

The record `{ language, messages }`, as it was handed.

## Errors

- `code.T1010`: the file holds something beside messages written in place, which the build reads without running the file. Write each message as a text, a record of plural forms, or a record of more messages.
- `code.T1014`: two files of one language give the same key. Give each key in one file of that language.
- `code.T9001`: a key that one language gives and another lacks: the message of the default language is shown in its place until the other gives it.

## See also

`word.message`, `hook.useTranslations`, `option.project.languages`, `topic.words`
