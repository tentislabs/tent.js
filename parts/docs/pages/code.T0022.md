# T0022 address-refused

The guarded fetch refused an address. The message names the address and the rule, and `fields.rule` holds the rule in one word.

## Details

| `fields.rule` | The address |
|---|---|
| `secure` | is reached without a secure connection, and is neither a local address in the mode `development` nor a host that `privateHosts` lists with `http://` in front |
| `private` | is an address of this computer or of a private network, or a name that answers one, and the project does not list it. Also `localhost`, a name that ends in `.localhost`, `.local` or `.internal`, with every dot at its end taken off, a name with an empty piece between two dots, and an address with a zone after a percent sign |
| `password` | holds a user name or a password. Also a host with them in front that is handed to `guardedAddress` |
| `redirects` | is a fourth redirect, or one more than who asks stated with `redirects` |
| `body` | is another host, to which a redirect would send the body of the request on, as a 307 and a 308 do |

An address written as one number, in base eight or sixteen, or as an IPv4 address inside an IPv6 one, is read into the address it means before the ranges are checked. A name that answers several addresses is refused when one of them is private, and without a secure connection each of its addresses is held by itself. Every redirect is held to the same rules as the first address.

A local address is one that is written as an address of this computer, as `localhost`, or as a name that ends in `.localhost`. Any other name that answers this computer is held as on live data, in the mode `development` too.

The address is shown without a name, a password and what follows a question mark, so that no key of an address reaches a log.

## The fix

Reach an outside address by `https://`. For a host of your own network, list it in `privateHosts` of the project: a host name or an address, with a port when only that one is meant, and with `http://` in front when it is reached without a secure connection. Send a sign-in in a header, and never in the address. Where a host sends a request with a body on to another host, ask that host itself.

## See also

`option.project.privateHosts`, `topic.fetch`, `code.T0023`
