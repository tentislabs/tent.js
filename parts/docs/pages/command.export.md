# `tent export`

Writes a site, or the public part of an app, out as plain files for any host of files.

## Usage

```
tent export --out <folder> [--base <path>] [--origin <scheme and name>] [--names any] [--data <folder>]
```

The command builds the project as a release, gives that bundle to the engine that runs on the data folder, has it write the site out with its data, and drops the version again. With no engine running it starts one for the length of the command, on the development data. So an export never holds a development build: no source of a screen file, and the page code in its small form. `--out` is a folder of the project, or a whole path.

For each screen that anyone may see, as nobody, and for a screen with values in its address once for each row of `seo.addresses`, the export writes:

| File | Holds |
|---|---|
| `<address>/index.html`, and `index.html` for `/` | The page of that address |
| `_t/s/<address>.json`, and `_t/s/index.json` for `/` | What a move to that address needs |
| `_t/b/...` | The browser files and the assets of the bundle |
| `sitemap.xml`, `robots.txt`, `404.html` | The sitemap where an origin is given, a `robots.txt` that lets everything be read, and the `notFound` screen |

What is left out is named in `skipped` with the reason: a screen that is not open to anyone, one with values and no `seo.addresses`, an address with a value that holds a slash, a backslash, two dots or a control character, one with a sign that cannot stand in the name of a file on every system (`<`, `>`, `:`, `"`, `|`, `?`, `*`, or a dot or a space at its end), and the second of two addresses that differ only in capitals.

Run again, an export writes the site anew: it keeps the list of what it wrote in `_t/export.json`, removes each file of the list before that it does not write again, and touches no other file of the folder.

With no engine behind an exported page nothing is live and no call can be made. A page finds out once, when it comes alive, by asking `/_t/health` under its base: any answer but the engine's own means none, and the page then opens no connection and asks nothing again. A press that needs a call fails at once with `code.T0001`. A move to another page takes the file under `_t/s/`, and where there is none it loads the address as a whole page.

With the engine behind the same address everything works as in a served app: the host sends every address that it holds no file for on to the engine, with the base taken off. Calls, the live connection and sign-in then stay on one site. After a new version an exported page follows the running version from its first call. What the host sends on is counted as every request is (`code.T0005`): `/_t/health`, which each page asks once, by nothing, a screen that the engine draws on `screensPerMinute` of its address, and a call on its caller. A host that the engine is told of as a proxy and that states each visitor's address in `X-Forwarded-For` has each visitor counted alone; one that states none is one address for all of them.

A host of files sends its own headers, so the policy of each page is a line of its head. Who may frame a page cannot be said that way, and is the host's to set.

## Options

| Option | What it does |
|---|---|
| `--base <path>` | For a host that serves the site from a folder, as `/shop`: every address the pages name starts with it |
| `--origin` | The scheme and the name the site will be reached by, as `https://shop.example.com`. It is written into the sitemap, into the one address of each page, and into the policy line: scripts and styles come from `<origin><base>/_t/b/` alone. Left out, the pages name no site, there is no sitemap, and the policy line names the page's own site |
| `--names any` | Keeps an address with a sign that not every system takes in the name of a file, and both of two that differ only in capitals, for a site that is built on, and for, a system that takes them |

## Example

```
tent export --out site --base /shop --origin https://shop.example.com
```

A program that holds the app writes the same with `app.export('site', { base: '/shop', origin: 'https://shop.example.com', version })`, which answers `{ pages, skipped, findings }`.

## Output

With `--json`:

```json
{ "ok": true, "value": { "pages": ["/", "/about"], "skipped": [{ "what": "deskScreen", "why": "The screen is not open to anyone." }], "findings": [] }, "findings": [] }
```

## Errors

| Code | When |
|---|---|
| `code.T6016` | A warning: a screen that calls a function, through `call`, a `Form` or an entry of `data` that does not wait, is written all the same |
| `code.T0013` | `app.export` of a version that was built for development |
| `code.T0002` | A base or an origin that is none |

## See also

`topic.commands`, `topic.engine`, `option.screen.seo`, `code.T6016`
