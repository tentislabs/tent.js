# `python` of `project`

The Python of the project, and what its lock is made with.

## Value

`{ version, index, build, own, locks }`, each of which may be left out.

- `version` names the Python of the project, as `'3.15'`: one of those the engine pins, which `tent python lock` lists where another is named. Left out, the newest the engine pins is used.
- `index` is a list of package indexes that are asked beside the usual one, for a company's own packages or another build of one. Each is an `https` address with no name and no password in it, or `{ url, user: secret('...'), password: secret('...') }`, whose secrets the engine opens and hands the installer alone.
- `build` names the packages that may be built on the computer where no ready-built file exists. Left out, nothing is built, and no code of a package is run while it is installed.
- `own: { version, address, fingerprint }` names a ready-built Python that the engine does not pin, fetched from that address and held to its SHA-256 fingerprint like any part.
- `locks: { old: { version } }` gives a named lock a Python of its own, so one project may hold two.

## Example

```ts
export const shop = project('shop', {
  python: { version: '3.15', index: ['https://packages.example.com/simple'], build: ['numpy'] },
})
```

## Errors

`code.T1014` for an index that is no `https` address or holds a name and a password, and an entry of `build` that is not one name.

`code.T7020` when a lock was made for another Python than `version` names.

## See also

`word.project`, `word.python`, `command.python`
