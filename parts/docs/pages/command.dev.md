# `tent dev`

Builds the project, runs it in the mode `development`, and watches its folder, until the program is told to end. Each save is built and switched to, and every open page follows it.

## Usage

```
tent dev [--port <n>] [--fresh] [--mail] [--keep] [--inspect <origin>]
```

## Options

| Option | Means |
|---|---|
| `--port <n>` | The port. Left out, it is 3000. Where the port is taken, the next free one is used, and the command says which. 0 takes a free one that the system picks, which the line `<app> runs at http://localhost:<port>` on the standard error names |
| `--fresh` | Empties the development data first, and applies `seed.ts` again. The secrets and the settings with their key, the history, the bundles, the cache, `backups/`, `certs/`, `evals/` and `shots/` stay |
| `--mail` | Sends mail, in place of writing each message to the log |
| `--keep` | Removes the rows past the time their table keeps them (`option.table.lasts`), as the engine does in every other mode |
| `--inspect <origin>` | Prints an address of the app in the inspect mode, for a visual tool whose pages come from that origin, as `http://localhost:5173`: the tool may show the page in a frame, and the page tells it which element is pointed at (`topic.inspect`). An origin is a scheme, a host and a port, and nothing else: anything more is `code.T0002`, and the command ends before it runs |

It runs until Ctrl+C in its terminal, or until it is told to end: a program that started it ends it by the number of its child, as `command.start` says of `tent start`, and it closes its engine first where the system tells it so. The data folder is `.tent/` of the project. Data that is empty is seeded at the start. The app answers this computer alone, by `localhost` and its own number. A person is signed in through the app's own sign-in screen, as on a server (`topic.signIn`).

## Example

```
tent dev --port 4000
tent dev --inspect http://localhost:5173
```

## Output

Each save does four things:

1. The project is built for development, and our own rules of the check are held against what the build read. Saves are built one after another, in their order.
2. With no error among the findings, the new bundle is handed to the running app, `app.add` and then `app.switch`, which runs it from the folder that the build wrote. Safe and stated table changes apply to the development data.
3. The engine tells every open page of the new version. A save that changed the look alone is taken in place by React's own Fast Refresh, as Next.js and Vite run it: the page takes the modules that changed, swaps its style files, and draws the views again where they stand. It asks for no screen and no data again, so its data, its declared state, its address, the scroll, a typed field and what its views keep in React (`useState`, `useRef` and the rest) all stay. Every other save starts the views anew: the page asks for its screen again under the new version, loads the files it does not hold, swaps its style files, and draws the screen again, with its declared state, its address and its place in the page kept, and what the views kept in React started from their first values.
4. With an error among the findings nothing is switched: the last good version keeps running, what the views keep stays, and the findings are printed and shown as an overlay on every open page. A table change that is refused is such a finding. The save that mends it takes the overlay away.

**The look alone.** A save changes the look alone where each file it changed is a screen or a component file whose definitions changed nothing but the code of their views, or a file whose every export is a React component, and no backend file, language file or `project` changed. A file that exports anything else, a helper or a constant, is taken in place through the files of components alone that import it; where a screen file imports it, the save starts the views anew. A changed style file is swapped as it is in every save.

**What stays, and how to start anew.** React decides what a view keeps, as Next.js says of it: a view whose hooks, their order or what is handed to them changed, a first value of `useState` among them, is mounted anew, and every hook with dependencies runs again. A file that holds the comment `// @refresh reset` mounts its components anew at every save. After each save that was taken in place, a quiet mark "state kept" stands at the top of the page, with **reset**: its press, or Alt+Shift+R, mounts the screen that is shown anew, with its data and its declared state kept, and no load of the page. The mark leaves at the next move or load. A failure while drawing after such a save mounts the screen anew with the new code and shows in the overlay; the next good save draws it again.

**A package.** A file of a package that a screen imports, under `node_modules/`, that changes has every open page load its address anew: a package is never taken in place.

The type checker runs beside this and holds nothing back. What it finds is printed and arrives in the overlay when it is ready.

A version that no page needs any more is dropped: its list under `.tent/build/` is removed, and each file of `.tent/build/files/` that no list names any more.

The overlay: in development a page shows what is wrong along its lower edge: each finding with its code, where it is and its fix, and each thing that the content policy of the page blocked, with the entry of `unlock` of `project` that would open it. The overlay is there in the mode `development` only.

**A failure while running points at its source.** A development bundle holds a source map for every module it writes. A view that throws as it draws, on the server or in the browser, an action, a change, a step of a flow or a route that throws, is shown in the overlay of every open page, as a finding is: its code, its words and what failed, the file, the line and the column of the project's source, the lines around it, and the chain of calls that led there, each run of calls of the framework folded into one line, and one of a package folded with the name of the package and its file. The terminal says the same, with the path of the file. The page itself still shows its `error` screen. The save that switches to the next version takes the failure away. A release bundle holds no map, and no page outside development is sent one.

When the app runs, the command says on the standard error where. When the program is told to end, it closes its engine, and with `--json` prints what it ran:

```json
{ "ok": true, "value": { "app": "shop", "version": "f359ab2fd937cb70b23f404190efb7cc", "port": 3000, "mode": "development" }, "findings": [] }
```

The runtime cannot forget a module that it loaded, so the memory of the engine grows through a long day of saves to files that hold code. The command says so when it passes 1 GB: starting it again clears it.

## Errors

`code.T0013` for a second `tent dev` in one project, which names the program that runs the first. `code.T0002` for an `--inspect` that is no origin. A project that cannot be built at the start is printed with its findings, and the command waits for the save that mends it.

## See also

`topic.commands`, `topic.engine`, `topic.live`, `topic.build`, `topic.inspect`, `command.start`, `command.check`
