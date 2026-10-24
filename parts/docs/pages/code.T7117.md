# T7117 not-connected

A service whose auth is `oauth` was called for a user who has no connection to it, or for no user at all. `fields.service` names the service.

## Details

A call uses the connection of the user it runs as, and a key that was made for a user is that user. A call that runs for no user - the system with no `for`, a key made for nobody, a visitor - has none. A connection is also gone where the provider refused to renew its token. A service that names another in `connection` uses that one's connection. A test reaches a faked service of this kind once `app.connection` made a connection.

## The fix

Have the user connect their account with `connections.start`, and show the screen that offers it where a call answers this code. A run of the system names the user whose account it uses: `github.listIssues(input, { for: userId })`.

## See also

`handle.connections`, `option.service.auth`
