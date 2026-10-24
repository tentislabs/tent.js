# `messages` of `choice`

The key of the language files under which each value of the choice has its message, so that a form shows the values in the language of its page.

## Value

Text: with `messages: 'orders.status'` the message of `open` is `orders.status.open`. Left out, the choice names no messages.

## Example

```ts
status: choice(['open', 'paid'], { messages: 'orders.status' })
```

## See also

`word.choice`, `word.message`, `topic.types`
