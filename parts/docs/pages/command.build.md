# `tent build`

Writes a bundle of the project: its description, the built module of each backend file that holds code, and its assets. The version id of the bundle is the fingerprint of its description.

## Usage

```
tent build [--out <folder>] [--dev]
```

## Options

| Option | Means |
|---|---|
| `--out <folder>` | The folder of the bundle. Left out, it is `.tent/build/<version id>/` in the project |
| `--dev` | A development build in place of a release: the inspect mode tells the place of each element of its pages, as the test side of a workspace in its box is built |

## Example

```
tent build --out ./dist
```

```
version: f359ab2fd937cb70b23f404190efb7cc
bundle: /apps/shop/dist
packages:
  tiny-bars: 211 bytes in the page
```

Each package of the project that reaches a browser is told with the bytes it stands for in the modules a browser loads. A heavy package makes a page heavier, and is told, never refused: `tent map` tells who uses it.

## Output

With `--json`:

```json
{ "ok": true, "value": { "version": "f359ab2fd937cb70b23f404190efb7cc", "bundle": "/apps/shop/.tent/build/f359ab2fd937cb70b23f404190efb7cc", "packages": { "tiny-bars": 211 } }, "findings": [] }
```

With an error among the findings no bundle is written: `value` is `null`, and the command ends with 1.

## See also

`topic.build`, `command.check`, `topic.commands`
