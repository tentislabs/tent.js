# `Mailer`

The place where a program plugs in what sends the mail of an app.

## Interface

One function, `send`, which takes a mail and answers when it is sent.

## Example

```ts
engine.give(Mailer, { send: async (mail) => post(mail) })
```

## See also

`handle.log`
