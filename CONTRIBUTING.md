# Contributing to Tent.js

Thank you for helping. Bugs, ideas and questions go to the [issues](https://github.com/tentislabs/tent.js/issues). For a change of more than a few lines, open an issue first, so we agree on it before you write it. A security problem goes to the address in [SECURITY.md](SECURITY.md), never to a public issue.

## Setting up

You need Node.js 26.11.0, the version that `.node-version` names, and git.

```sh
git clone https://github.com/tentislabs/tent.js
cd tent.js
npm ci
```

`tent` runs from the copy as it stands: `npm run tent -- <command>` inside it, or `node <the copy>/parts/cli/shell.ts <command>` from a project of your own. A program of your own that imports the framework from the copy is started with the hook that finds its imports there: `node --import <the copy>/parts/cli/names.ts server.ts`. `--import` takes an address of a module: a relative path, or on Windows a whole one written as `file:///C:/...`.

## The layout

| Folder | Holds |
|---|---|
| `parts/` | The framework, one folder for each part. A part's entry files, which `parts/entries.json` lists, are all that another part may import. |
| `parts/<part>/tests/` | The tests of that part |
| `parts/docs/pages/` | The docs that ship in the package, one Markdown file for each page |
| `examples/` | Whole apps built with Tent.js, each with a README |
| `install/` | The release: the layers of each system, the installers and the npm packages |
| `rig/`, `scripts/`, `tests/` | What the tests stand on, the checks of the repository, and their own tests |

## Checking a change

```sh
npm run all
```

runs every check, as the automatic runs do on Windows, macOS and Linux: the made lists (`npm run lists`), the formatter and the linter (`npm run lint`), the type check (`npm run types`), the search for what nothing uses, and the tests (`npm test`). One test file alone, with the two hooks that `npm test` gives every test, for a screen file and for a test that reaches no network: `node --import ./rig/jsx.ts --import ./rig/offline.ts --test parts/<part>/tests/<file>.test.ts`. A test whose name holds `[night]` is a heavy one, run by `npm run night`. `npm run format` lays the code out as the formatter does.

`npm test` runs again only what a change touched. Each test file runs in a program of its own, and `rig/touched.ts` notes every source file that program loads and every file and folder it reads, copies, opens or lists in the repository, a copied folder by every file in it, also in the programs a test starts and in every thread of them, each as it stood when it was first read, and each word of the environment they read as the run handed it, by the fingerprint of its value; `results/kept/` keeps that record with how the file ended. A file changed while its test ran keeps no record. A file is run again where a file it touched or a word it read changed, where it failed, where it holds a night test or a measure, where its rigs wrote a measure or a picture, or where the runtime, the system, `package-lock.json`, `biome.json`, `tsconfig.json`, `budgets.json` or the files of the run itself changed; every other file is replayed, and its tests stand as they ended when it was kept. `npm test -- --all` runs every file, and `npm test -- --profile` writes what each test file cost in time and memory into `results/profile.json`, with the costliest printed. A run starts as many test files at once as the processor has cores less one and the memory there is holds, hands every program the runtime's compile cache under `results/compile-cache/`, and gives each program one browser of each engine, with a context of its own for each use. A pull request runs what its change touched, by the records of `main`, and a push to `main` runs everything and keeps the records. A test that fails fails the run: nothing is run a second time.

Our rule for tests, from the faults of the public runs: no wait by time, no zone assumed, no path assumed, no right of the account assumed, and measures alone are held to time. Before you push, run your change on this computer with each machine's own setting: a zone other than yours, a path with a space, an account with no right of its own.

## Writing a change

- **Tests first.** A change comes with the tests that prove it, and each of them fails without the change.
- **TypeScript in strict mode**, ES modules, with nothing that silences the type checker: no `any`, and no cast through `unknown`.
- **A file does one job**, and one job lives in one file. No part reaches inside another: it imports the other's entry files alone.
- **Nothing left behind.** When a thing is replaced, the old one goes in the same change. No export that nothing uses, no code that is commented out.
- **A comment says why**, in a line or two: a constraint, a trap, an outside fact with its address. Never what the code does.
- **Every failure is a `TentError`** with its code, and every code, command, word, option, tag and hook has its page in `parts/docs/pages/`. A change of what the framework does changes its page in the same pull request.
- **Plain words.** The same word always means the same thing, in the code and in the docs.

## Pull requests

Keep one pull request to one change. Its text says what it changes and why, and the automatic runs pass on the three systems before it is merged.

By contributing, you agree that your contribution is given under the [MIT licence](LICENSE) of Tent.js.
