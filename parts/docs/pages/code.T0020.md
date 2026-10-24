# T0020 no-mailer

`mail.send` was used where a message would be sent, and the app has no mailer.

## Details

An app has a mailer when its project states `mail` with the secret that holds the address of its mail server, or when a program connected a `Mailer` of its own. In the mode `development` a message is written to the log and not sent, so this code is not raised there unless the app was started with `tent dev --mail`.

## The fix

State `mail: { from, send }` in `project`, with the secret that holds the address of the mail server, or connect a `Mailer`.

## See also

`handle.mail`, `option.project.mail`
