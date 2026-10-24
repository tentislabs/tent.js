# `Mailer`

What sends the mail of an app. The mailer that ships sends by SMTP to the server that `project.mail` names, and prints each message to the log in development; a mailer of the builder's own sends by any mail service.

## Interface

```ts
interface Mailer {
  send(message: {
    to: Who[]
    from: Who
    subject: string
    text?: string
    html?: string
    replyTo?: Who
    cc?: Who[]
    bcc?: Who[]
    headers?: Record<string, string>
    attach?: { name: string; kind: string; bytes: Uint8Array }[]
  }): Promise<{ refused?: string[] }>
}
interface Who {
  address: string
  name?: string
}
```

`send` is called from `mail.send` alone. It is handed every address as a record and every list as a list, and each attached file read first, since a mailer reads no file itself. `refused` of its answer names the addresses that the service did not take: the message went to the others, and `mail.send` fails with `code.T0021`, which names them. A mailer that throws took the message for nobody. A mailer may have `close`, which the engine calls when the app is closed. In a test, `app.mailbox` takes the place of every mailer.

## Example

```ts
// engine.ts
import type { Mailer, Makers } from 'tentjs/engine'

const mailer = (key: string): Mailer => ({
  send: async (message) => {
    const answer = await fetch('https://mail.example.com/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(message),
    })
    if (!answer.ok) throw new Error(`the mail service answered ${answer.status}`)
    return {}
  },
})
export default { mailer: ({ secrets }) => mailer(secrets.MAIL_KEY.reveal()) } satisfies Makers
```

## See also

`handle.mail`, `option.project.mail`, `code.T0020`, `code.T0021`
