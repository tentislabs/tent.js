# T9003 unknown-message

A message whose key no language of the project has.

## Details

The check holds three things to the language files:

```ts
<h1>{message('orders.titel')}</h1>                          // T9003: no language gives orders.titel
note: text({ label: message('field.note') })               // T9003 where no language gives field.note
status: choice(['open', 'paid'], { messages: 'status' })   // T9003 for each value with no message under status.<value>
```

A `message(...)` whose key is written in place is held in a view and in a backend file alike, as the `label` and the `help` of a type. A key that is built from a value, as `message(['status', o.status])`, is held through the choice it is built from: every value of a `choice` that states `messages` has its message.

## The fix

Give the key in the language files, or name a key that they give.

## See also

`word.message`, `option.choice.messages`, `code.T9001`
