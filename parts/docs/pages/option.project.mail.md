# `mail` of `project`

How the app sends mail.

## Value

`{ from, send }`: an address as text or `{ name, address }`, and the secret that holds the address of the mail server. Left out, `mail.send` needs a mailer that a program connected.

The secret holds `smtps://user:password@host:465`, or `smtp://user:password@host:587`, where the connection is made secure before anything is sent. The name of the server is looked up once for each message, and a private or local address is refused (`code.T0022`) unless `privateHosts` lists it.

## Example

```ts
export const shop = project('shop', {
  mail: { from: 'shop@example.com', send: secret('SMTP_URL') },
})
```

## See also

`word.project`
