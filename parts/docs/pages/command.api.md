# `tent api`

`tent api read` turns a published description of an API into the JSON that the build reads from a service's `from`: a file in YAML, and one of the version before 3.0, become JSON of version 3.1.

## Usage

```
tent api read <file or address> --out <file>
```

## Options

| Option | Means |
|---|---|
| `<file or address>` | The description to read: a file, by its path from the folder the command is typed in, or an address, which is fetched |
| `--out <file>` | Where the JSON is written, inside the project. It is written whole beside its place and renamed into it |

A file of version 3.0 or 3.1 that is JSON already is written as it is. The reader of YAML is a part that the tools fetch the first time it is needed. The file is read here once, and never while the app runs: the build reads only the calls that `use` names.

## Example

```
tent api read https://example.com/stripe.yaml --out services/stripe.openapi.json
```

## Output

With `--json`:

```json
{ "ok": true, "value": { "out": "services/stripe.openapi.json", "version": "3.1.0" }, "findings": [] }
```

## Errors

`code.T7013` for what is no description of an API in version 2.0, 3.0 or 3.1, and for a text that reads neither as JSON nor as YAML: nothing is written. `code.T0016` where the reader of YAML cannot be fetched.

## See also

`option.service.from`, `option.service.use`, `code.T7013`
