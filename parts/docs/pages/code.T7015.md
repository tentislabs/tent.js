# T7015 secret-revealed

Code calls `reveal()`, and so opens a secret. A note of the check, which lists every such use.

## Details

A secret that a definition names with `secret('NAME')` is put on its outgoing call by the framework, and no code of the app ever holds its value. `secrets.NAME.reveal()` hands the value to the code itself, which may then answer it, store it or send it anywhere. The check cannot follow a value through code, so it lists each place where one is opened, for whoever reads the check to look at.

The note stands at the line of each call, in a definition, in a helper file and in `engine.ts` alike.

## The fix

Nothing to mend where the code needs the value itself: to sign a token, or to hand a key to a package. Where the value only travels on a call to a service, a model or the mail server, name the secret in the definition and take `reveal()` away.

## See also

`handle.secrets`, `code.T3007`
