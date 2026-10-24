# `tent update`

Updates Tent.js on this computer to the newest release, or to the version you type, and takes you back to the one before with `--back`. Apps, keys and data stay.

## Usage

```
tent update [version] [--back] [--build-tools] [--keep] [--time <time>]
```

## Options

| Option | Means |
|---|---|
| `version` | The version to take, as `1.2.3`. Left out, the newest that `releases.json` names; a lower version than the one you have is taken only where you type it |
| `--back` | Swap the version you have with the one before it, which the install kept |
| `--build-tools` | Bring the build tools too, to an install that holds the player alone |
| `--keep` | Remove no older version. Left out, a version older than the one before is removed, unless a program still runs from it, which the next update removes |
| `--time <time>` | How long one layer may take to arrive. 30 minutes where it is left out |

## Example

```
tent update --build-tools
```

Every list of a release is signed, and each layer is held to the size and the fingerprint that its signed `release.json` states. The layers are laid beside the version you have and then put in place, and the version is switched last: a kill in the middle leaves the version you had in use. A second update that is typed at the same time waits for the first, and then finds nothing to do. Releases come from the one address that ships with the install; `TENT_RELEASES=<address>` names a copy of your own, whose files are still held to our signatures.

Installed with npm, updating is npm's own: the command says which npm command to type, and ends with 2.

## Output

With `--json`, the version that is current now, and the one that was:

```json
{ "ok": true, "value": { "version": "1.2.3", "was": "1.2.2" }, "findings": [] }
```

## Errors

`code.T0026` where a signature, a fingerprint, the age of a list or the version that a `release.json` names does not fit: nothing changes. `code.T0013` under the npm door, and where no address of releases is known.

## See also

`command.uninstall`, `code.T0018`
