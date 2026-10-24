# `tent shot`

Makes a picture of a screen of the app that runs, as nobody sees it, with a browser of the Chromium family that is already on the computer.

## Usage

```
tent shot <path> [--size <width>x<height>] [--full] [--dark] [--wait <ms>] [--out <file>] [--data <folder>]
```

The command asks the engine that runs on the data folder, `.tent/` of the project or the one that `--data` names. With no engine running it starts none and says so (`code.T0013`): start the app first, with `tent dev` or `tent start`.

| Flag | What it does |
|---|---|
| `--size` | The size of the window, 1280 by 800 where it is left out |
| `--full` | Takes the whole height of the page |
| `--dark` | Asks the page for the dark setting of the device, which the project's CSS reads (`topic.look.dark`) |
| `--wait <ms>` | How long the page may take, ten seconds where it is left out |
| `--out <file>` | Where the picture is written. Without it, it goes to `shots/` in the data folder, and its path is printed |

The picture is taken when the page has come alive, its first results have arrived, and no request was open for half a second, or when the wait is over, whichever comes first.

Every request that the browser makes for another place than the app is made by the engine, under the rule of every fetch of the app: outside addresses, and no private or local address that `privateHosts` does not list. A picture taken on a server never looks into the server's own network, whatever hosts the project lists. A picture on such an address is left out of the picture.

The browser is Chrome, Edge or Chromium where one is installed, or the program that `TENT_BROWSER` names. Nothing is borrowed for it: the engine drives the browser over the browser's own channel.

## Example

```
tent dev
tent shot /orders --size 1280x800 --full --out orders.png
```

A program that holds the app takes the same picture with `app.shot('/orders', { size: { width: 1280, height: 800 }, full: true, out: 'orders.png' })`, and in the modes `development` and `test` one as a user with `as`, by a session it makes for that user (`topic.engine.web`).

## Output

With `--json`:

```json
{ "ok": true, "value": { "file": "orders.png", "width": 1280, "height": 2140, "status": 200 }, "findings": [] }
```

## See also

`topic.commands`, `topic.engine`
