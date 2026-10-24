# T7020 python-lock-stale

The lock of the packages of the project's `python` definitions does not fit the project: the build writes no bundle until it does.

## Details

The build and the check hold each lock of the project, `python.lock` and one for each `lock` that a definition names, to what the project says today. They report:

- a lock that a definition is locked into and that is not there;
- a second line, `# packages ...`, that holds other entries than the `packages` of its definitions, in the order of their names and then as each wrote them: the finding names each entry that is new and each that is gone;
- a first line, `# python ...`, that names another Python than `python.version` of `project`, or than `version` of the named lock in `python.locks`;
- a line that is no line of a lock: an option, as `--index-url`, an address, a path of a file, or any other form. A lock holds a package with its exact version and the mark of a system on a line, and the lines under it that each hold one fingerprint.

`tent python lock` reports it too, where it cannot make a lock: for a Python that the engine does not pin, with the ones it does; for two definitions that need two versions of one package, by their names; and for a package that has no ready-built file and that `python.build` does not name. A package with no ready-built file for one system alone is a warning of `tent python lock` with this code, which names the system.

## The fix

Run `tent python lock`, which makes each lock anew from the `packages` of the project, and build again. Where two definitions need two versions of one package, give one of them a `lock` of its own. Where a Python is not pinned, name one that is in `python.version`.

## See also

`command.python`, `word.python`, `option.python.lock`, `option.project.python`
