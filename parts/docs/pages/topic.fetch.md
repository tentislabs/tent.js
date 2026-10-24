# The guarded fetch, and parts that are fetched

Every request that the framework's own parts send out passes one function, the guarded fetch, which holds an address to where it may go. The engine fetches the parts that are not in the install through it, each at its first use.

## The guarded fetch

```ts
import { guardedFetch } from 'tentjs/connect'

const fetch = guardedFetch({ mode: 'live', privateHosts: ['http://10.0.0.5:8080'] })
const answer = await fetch('https://api.example.com/items', { size: 1_048_576, time: 5000 })
```

`guardedFetch(o)` answers a function that is called as the runtime's own `fetch` is, with a `size` in bytes, a `time` in milliseconds and a number of `redirects` beside it. It holds each request to these rules, and refuses with `code.T0022`:

- Secure addresses only, but for a local address in the mode `development`, and a host that `privateHosts` lists with `http://` in front. A local address is one that is written as an address of this computer, as `localhost`, or as a name that ends in `.localhost`.
- The name is looked up once, and the connection goes to exactly that address. An address of this computer or of a private network is refused unless `privateHosts` lists it, and so is a name that answers one. In the mode `development` a local address is reached.
- An address in another form, as one number or as an IPv4 address inside an IPv6 one, is read into the address it means first.
- An address with a user name or a password in it is refused.
- Every redirect is held to the same rules, and three are followed unless `redirects` states another number. To another host only `Accept`, `Accept-Language`, `Content-Type` and `User-Agent` are sent on, so a sign-in stays with the host it was written for. A body stays with it too: a redirect that would send the body of a request on to another host is refused.

An answer is cut at 10 MB and at 30 seconds unless `size` and `time` state another, with `code.T0023`. A size, a time or a number of redirects that is stated is a number that is not negative: anything else fails before a connection is made.

| Option | Holds |
|---|---|
| `mode` | The mode of the app: `'development'`, `'test'` or `'live'` |
| `privateHosts` | What the app may reach of this computer and of a private network, as `option.project.privateHosts` lists it |
| `plain` | `true` makes the form that holds the address rule alone: it reaches an address that is not secure, cuts no answer, and follows as many redirects as the runtime's own `fetch` |
| `roots` | Certificates, as text in the usual form, that a secure connection is held to beside those of the runtime |
| `bodyTravels` | `true` states that a redirect may send the body of a request on to another host |

## An address for a connection that is no fetch

```ts
import { guardedAddress } from 'tentjs/connect'

const address = await guardedAddress('mail.example.com', { mode: 'live' })
```

`guardedAddress(host, { privateHosts, mode })` looks a name up once, holds what it answers to the same ranges, and answers the one address to connect to. A host may carry a port, `'10.0.0.5:5432'`, where a line of `privateHosts` names one port. A host with a name or a password in front is refused, as an address with them is.

## Parts that are fetched

```ts
import { fetchPart } from 'tentjs/engine'

const folder = await fetchPart('reader')
```

`fetchPart(name)` answers the folder of a part, `fetched/<name>@<version>/` in the runner's folder: what `TENT_HOME` names, and otherwise `%LOCALAPPDATA%\Tent` on Windows and `~/.tent` on macOS and Linux. The fetch is held to the mode of the app whose call it is made in, and to `live` outside a call. Where the part is not there yet, it is downloaded through the guarded fetch, held to the fingerprint that the engine pins for it, unpacked, and moved into its place whole. Two calls for one part at once share one download, where they ask alike: into the same folder, from the same address and in the same mode. Inside a call a fetch is waited for as long as `limits.fetchTime` of the project says, and outside one for two minutes.

A part is laid from all its files together, in two passes. First every folder and every plain file is written, and then the links are laid, each once the disk can follow it to an end inside the folder of the part. A link may lead through another link of the part. A download that does not fit its fingerprint is thrown away, and so is a part with a path that leaves its folder or is written twice, with an entry under the path of a link, with a hard link that names no file, or with a link that leaves the folder at any piece of its way, whose words hold a backslash, or that leads to nothing or to the folder it lies in or to one above it.

A part in which a link leads nowhere is held for one that is not there, and is fetched anew: so a part outlasts a move of the runner's folder. The call then fails with `code.T0016`.

Where a server may not reach the places the parts come from, `TENT_PARTS` names an address of your own that serves the file of every part under its own name.

## See also

`code.T0016`, `code.T0022`, `code.T0023`, `option.project.privateHosts`, `topic.engine`
