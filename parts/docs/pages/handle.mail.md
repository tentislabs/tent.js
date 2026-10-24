# `mail`

Sends mail from backend code: `mail.send` hands one message to the mailer of the app. Nothing that a person typed into a form can add a receiver or a line to the head of a message.

## Example

```ts
import { action, mail, text } from 'tentjs'

export const sendReceipt = action('sendReceipt', {
  access: 'signedIn',
  input: { to: text(), order: text() },
  run: async ({ input }) =>
    mail.send({
      to: input.to,
      subject: `Your order ${input.order}`,
      text: 'Thank you. Your order is on its way.',
    }),
})
```

## Members

| Member | Does |
|---|---|
| `mail.send({ to, subject, text, html, from, replyTo, cc, bcc, headers, attach })` | Sends one message, and answers a promise of nothing. `to`, `cc` and `bcc` are each one address or a list: a list in `to` is one message that shows every address to all, and `bcc` hides. One of `text` and `html` is required. `from` falls back to `mail.from` of the project. `headers` is a record of lines of your own, and `attach` a list of the ids of files |

**An address** is a text, or `{ name, address }` for a name beside it. It is exactly one address: one `@`, and no comma, semicolon, angle bracket, space or control character. A name holds no control character, no quote and no angle bracket.

**A header** has a name of letters, digits and hyphens, and holds no line break. `headers` may not name `To`, `Cc`, `Bcc`, `From`, `Reply-To` or `Subject`, whatever its capitals: each has its field.

**A file** that is attached is held to the rule of a download for the caller of the call, as `files.get` holds it. Code with full access attaches any file. The file is read whole before the message is handed on.

**What the mode does.** In the modes `development` and `test` the message is kept in the mailbox of the app, the one place every reader of unsent mail reads: `/_t/mail` and `tent logs --mail` in development, `app.mailbox` of a test app. In `test` nothing is sent and no mailer is needed: a `Mailer` that the program hands the app is its mailbox too. In the mode `development` its head, its text and the names of its files are written to the log too, and nothing is sent, also in a project that states no `mail` yet: `tent dev --mail` sends in development too. On live data it is sent.

**Where it works.** In an action, a route and a step of a flow, where a call may wait.

## Errors

`code.T0002` when the message does not fit: an address that is not exactly one address, a subject or a header with a line break, a header that names a line which has a field of its own, neither `text` nor `html`, a member that no message has, and a message that is from nobody.

`code.T0001` when an attached file is not there, or is not the caller's to have.

`code.T0020` when a message would be sent and the app has no mailer.

`code.T0021` when the mail server did not take the message: the log holds its answer. When the server took some addresses and not others, the message went to those it took, and the error names the rest.

`code.T0013` when `mail.send` is used in a query or a change, or with no call under way.

## See also

`option.project.mail`, `handle.files`, `handle.secrets`, `command.dev`
