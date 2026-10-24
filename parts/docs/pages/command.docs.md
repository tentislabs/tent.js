# `tent docs`

Prints a page of the docs. The pages are shipped with the installed version, so they never disagree with it.

## Usage

```
tent docs [name or code]
tent docs --reference
```

A page is asked for by its whole name, as `word.text` and `option.query.rows`, or by the name of its thing alone: a code, a command, a word or a topic. With nothing asked for, it prints the topics and how the pages are named.

`--reference` prints the reference: every word with every option, every hook, every tag and its properties, every command with its flags, and every code, each as its TypeScript signature or its line, with the first sentence of its page. It is made from the types of the installed version and the lists of its commands, tags and hooks, never written by hand, and it lies in the installed package as the file `reference.txt` beside the pages, so a coding agent reads it with no command.

**The docs as files.** The pages are files of Markdown, one for each page, `<name>.md` in the folder `pages/`, beside `reference.txt` and `AGENTS.md`, in the docs of the installed version: in a project, `node_modules/tentjs/tools/parts/docs/`. A program reads them as files, as the seed of a site of the docs fills a table of pages; one of another language runs `tent docs <name> --json` and reads `value`. The `llms.txt` of such a site is the text of `AGENTS.md` with each command that reads the docs on a builder's own computer written as the address of the same thing on the site: the reference, served as a file, and the index of the pages.

## Example

```
tent docs T1003
tent docs query
tent docs topic.words
tent docs --reference
```

## Output

With `--json`:

```json
{ "ok": true, "value": "# T1003 unknown-option\n...", "findings": [] }
```

A name that no page has ends the command with 2, and names the pages near it.

## See also

`topic.commands`, `topic.errors`
