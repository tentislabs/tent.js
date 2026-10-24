# `tent python`

Locks the packages of the project's `python` definitions, makes the environment of a lock ahead of the first call, and removes the environments that were not used for a time.

## Usage

```
tent python lock
tent python install [<project or bundle>] [--data <folder>] [--live]
tent python clean [--older <time>]
```

`lock` is a command of the build tools, and `install` and `clean` are commands of the player.

**`lock`** resolves the `packages` of every `python` of the project into `python.lock` in the root of the project: one file, for Windows, macOS and Linux at once, with each package at its exact version and the fingerprint of each of its files. A definition that states `lock: 'old'` is locked into `python.old.lock` instead, with an environment of its own. Its first two lines say what the lock was made from: `# python 3.15`, the Python of `python.version` in `project`, or the newest the engine pins where the project names none, and `# packages` with the entries of `packages`, in the order of the definitions' names. The lock is part of the project: keep it in its repository. Run the command again whenever an entry of `packages` changes: the build refuses a lock that was made from other entries (`code.T7020`). The installer of packages and the Python of the lock are fetched the first time they are needed, from where their makers publish them, or from the address that `TENT_PARTS` names. Packages come from the usual package index, from those that `python.index` of `project` names, and where `TENT_PARTS` names an address of your own, from the index under it at `<address>/simple/`.

**`install`** makes the environment of each lock of a project or a bundle, before the first call needs it: in `fetched/python-envs/` of the folder of the install, from the lock alone, with the fingerprint of every package file checked. Two apps with one lock share one environment. An environment that is there already is used as it is. Nothing is run of a package while it is installed, and nothing is built but what `python.build` of `project` names.

**`clean`** removes each environment that was not used for the time that `--older` names, 30 days where it names none. An engine marks an environment as used each time it starts a Python program of it, and once a day while one lives, so an environment in use stays.

## Options

| Option | Means |
|---|---|
| `--data <folder>` | With `install`: the data folder whose secrets an index of `python.index` names. Left out, it is `.tent/` of the project |
| `--live` | With `install`: the secrets of live data, in place of those of test data |
| `--older <time>` | With `clean`: how long an environment may stand unused, as `'30 days'` |

## Example

```
tent python lock
tent python install
tent python clean --older '60 days'
```

## Output

With `--json`, `lock` prints the Python the locks were made for and the files it wrote, `install` each environment by its lock, with whether this run made it, and `clean` the environments it removed and those it kept:

```json
{ "ok": true, "value": { "python": "3.15", "written": ["python.lock", "python.old.lock"] }, "findings": [] }
{ "ok": true, "value": { "environments": [{ "lock": "python.lock", "folder": "/home/ada/.tent/fetched/python-envs/4f1c9a0b2e7d3c51", "made": true }] }, "findings": [] }
{ "ok": true, "value": { "removed": [], "kept": ["/home/ada/.tent/fetched/python-envs/4f1c9a0b2e7d3c51"] }, "findings": [] }
```

A package that has no ready-built file for one of the systems is a warning of `lock`, which names the system: it cannot be installed there. Name it in `python.build` of `project` where it may be built on such a computer.

## Errors

`code.T7020` when `lock` is to make a lock for a Python the engine does not pin, which it lists, or cannot resolve the entries: two definitions that need two versions of one package, which it names, or a package with no ready-built file that `python.build` does not name.

`code.T0016` when the installer, the Python or a package could not be fetched, or a package file does not have the fingerprint its lock names.

`code.T0019` when an index names a secret that has no value in the data folder.

## See also

`word.python`, `option.project.python`, `option.python.packages`, `option.python.lock`, `code.T7020`
