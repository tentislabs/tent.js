# Sign-in for programs

A chat app acts for a person: that person signs it in, in the browser, the app's own way. The engine runs the standard's steps for it, and the person signs in at the project's `signInPath`, so a project that offers to MCP has a screen there (`code.T7004`).

| Address | For |
|---|---|
| `/.well-known/oauth-protected-resource/mcp` | Tells a client that `/mcp` is guarded, by the app, with the scopes `read`, `write` and those of `mcp.scopes`. The 401 of `/mcp` points here |
| `/.well-known/oauth-authorization-server` | The addresses below, the code way with renewal, the proof `S256` alone, and clients by their own documents |
| `GET /_t/oauth/authorize` | Where a client sends the person. One who is not signed in is sent to `signInPath` and comes back |
| `POST /_t/oauth/decide` | The person's yes or no. A `GET` there is 405 |
| `POST /_t/oauth/token` | Where a client changes a code for tokens, and renews them |
| `POST /_t/oauth/end` | Ends the grant of the renewal token it is handed |
| `POST /_t/oauth/register` | Where a client registers itself, only where `mcp.clients` holds `anyone('why')` |

1. **Who a client is.** A client names itself by the address of a document of its own, which says its name and where it may be sent back to; the engine reads it once the person is signed in, and its name must be the address it was read from. The builder may state clients too: `mcp: { clients: [{ id, name, redirects, for: 'app' }] }`. One that states `for: 'app'` may ask for a token for the whole app.
2. **Where a person is sent back:** to an address the client lists, letter for letter, which is `https`, or to this computer over plain http, on any port.
3. **The person is asked** on a page of the engine's own, plain HTML with no script, in the project's colors and language, which no site may show in a frame: who asks, the host of its document, and whether it may read, or read and change. Its words are the messages `tent.grant.title`, `tent.grant.read`, `tent.grant.write`, `tent.grant.allow`, `tent.grant.refuse`, `tent.grant.app`, `tent.grant.named`, and `tent.grant.scope.<name>` for a finer scope. A screen of the builder's own takes its place: `screen('allowApp', { for: 'grant', access: 'signedIn', view })`, handed `grant`: `{ name, host, named, scopes, for, word, allow, refuse }`, where a press calls `grant.allow` or `grant.refuse`. A grant that this person gave this client before is not asked about again where the client is sent back to an `https` address.
4. **The tokens.** A code works once, within a minute; it is changed with the proof for an access token, good for `limits.tokenTime`, and a renewal token, good for `limits.grantTime` from its last use. A token has the form of a key. A renewal gives a new pair; a renewal token used again within `limits.renewGrace` is given a pair once more, and noted as `reusedAt`; used again later, it ends the whole grant.
5. **What a token is.** A caller of the kind `mcp`: the user who gave it, with the roles of today, narrowed by what was granted. `read` lets it call what only reads, `write` every function, and a finer scope of `mcp: { scopes: { billing: ['invoices', 'pay'] } }` the functions it names. A token is a caller at `/mcp` and at the two addresses of files, with `write` for an upload, and nobody anywhere else. A token for the whole app, which the app's command line asks for, is a caller wherever a key is, and nobody at `/mcp`. A function that a token's scopes do not cover is answered 403 with the line that names the scope it lacks.
6. `handle.grants` lists what people allowed and ends it, and `app.grant({ user, scopes, client })` of `tentjs/test` makes a grant in a test.

Claude, for example, names itself by the document `https://claude.ai/oauth/mcp-oauth-client-metadata`, is sent back to `https://claude.ai/api/mcp/auth_callback`, and asks with `scope=read write` and with `resource` the address of `/mcp`. Nothing of it is stated in the project: the engine reads its document once the person is signed in.
