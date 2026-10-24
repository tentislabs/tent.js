# T0026 update-refused

An update, or a list that an install reads from where releases are served, was refused because it does not fit what was signed. Nothing changes.

## Details

| The case | What happens |
|---|---|
| A list - `releases.json`, a `release.json`, `trust.json`, `known.json` - that no key of the install's `trust.json` signed | It is not taken |
| A file of a release whose size or fingerprint is not the one its `release.json` states | It is thrown away, and the install is as it was |
| A signed list that is older than the one this install last took, as `seen.json` keeps it | It is not taken: an old list, rightly signed, cannot hide a newer one |
| A `release.json` that names another version than the one that was asked for | It is not taken |
| A layer that holds a path that leaves its folder, or anything but folders and files | It is thrown away |
| A list of known problems that names anything but versions and the sentence of a problem | It is thrown away, and the one before is kept: a list names versions, and never an address |

A list of known problems that is thrown away costs nothing else: the log of a running engine says so once, and the list read before stands.

## The fix

Where releases are served from a copy of your own (`TENT_RELEASES`), see that it holds the files as we signed them, and serves no older list. Else wait for the next release, and update again: `tent update`.

## See also

`command.update`
