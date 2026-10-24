# `tent start`

Runs a bundle as a server, until the program is told to end. It never builds: the bundle is one that `tent build` wrote. With `--domain` it serves the names it lists over secure connections, with certificates that it gets by itself.

## Usage

```
tent start [bundle] [--data <folder>] [--port <n>] [--host <address>] [--mode <mode>] [--seed] [--move] [--sleep-after <time>] [--mail] [--count-by <by>] [--proxy <name>=<value>] [--web <name>=<value>] [--parts <address>] [--secret-key-from <file>] [--update <fixes, all or none>] [--as-root]
tent start [bundle] [--data <folder>] [--domain <names>] [--secure <name>=<value>] ...
tent start --reads <address> --key-from <file> [--far] [--own <address>] [--insecure] [--data <folder>] [--port <n>]
tent start --works <address> --key-from <file> --kinds <kinds> [--at-once <n>] [--load <names>] [--fetched <size>] [--insecure] [--data <folder>]
tent start --versions-from <address> --key-from <file> [--every <time>] [--stop-runs] [--insecure] [--data <folder>]
```

## Options

| Option | Means |
|---|---|
| `bundle` | The folder of the bundle, as `tent build --out` wrote it. Left out, it is the newest in `.tent/build/` |
| `--domain <names>` | The names the app is served on, as `shop.example.com,www.shop.example.com`. The engine listens on 443 and, plain, on 80, or on `--port` and `--secure plainPort=<n>`, on every address of the computer unless `--host` names one. It gets a certificate for each name from Let's Encrypt, unless `--secure from=` names another authority, and typing `--domain` agrees to that authority's terms, whose address it prints the first time. The certificates lie in `certs/` of the data folder, readable by the current user alone: keep it on a disk that is kept. The plain port answers 308 to the secure address of a listed name, and `code.T0017` to any other, and a secure connection for a name that is not listed is closed at its start. It sends `Strict-Transport-Security` for one year, and speaks the newer form of the web too |
| `--secure <name>=<value>` | One entry of `secure`, with `--domain`: `from=<address>` of another authority, over `https` alone, whose redirects are not followed, `roots=<file>` of the roots that its own address is held to, `rate=<n>` tries an hour for each name (5), `renew=<a share or a time>` left of a certificate's life when it is renewed (a third), `cert=<file>` with `key=<file>` for a certificate of your own, as one for a name with a star, `hsts=<on, off or a time>`, and `plainPort=<n>`. It may be given several times |
| `--secret-key-from <file>` | The file that holds the key of the secrets, of the current user and readable by no other, as `--key-from` is held |
| `--update <fixes, all or none>` | A server that mends itself: once a day, when it reads the list of known problems, it reads the list of releases too, and with `fixes` takes the newest release of its own line that is marked as a fix, with `all` the newest of its major version. It fetches it as `tent update` does, lets the calls in flight end, and ends with 75, on which the launcher starts it again on the new version. Left out, it is `none`. Under the npm door it takes none, and says so |
| `--as-root` | Runs it as root or as an administrator, which it refuses otherwise: an app needs no such rights, and `tent service` gives the low ports by the definition of the system |
| `--data <folder>` | The data folder. Left out, it is `.tent/` |
| `--port <n>` | The port. Left out, it is 3000, and 0 takes a free one |
| `--host <address>` | The address the engine listens on. Left out, it is `127.0.0.1` |
| `--mode <mode>` | `development`, `test` or `live`. Left out, it is `live` |
| `--seed` | Applies the seed to data that is empty. Where the data folder holds data already, the command says that the seed was not applied. A seed that fails ends the command with its failure |
| `--move` | Where a table of the bundle gains or loses `tenant` while it holds rows, the app opens on the version its data ran and moves those rows as `tent publish --move` does (`option.table.tenant`). Without it such an opening is refused with `code.T2001` |
| `--proxy <name>=<value>` | One entry of what the engine is told of the proxies in front of it: `from=<addresses>`, with commas between them, which every other entry needs; `header=x-forwarded` or `forwarded`; `scheme=https`, `http` or `header`; `host=true` or `false`. Left out, `header=x-forwarded`, `scheme=https` and `host=false`: a request from the proxy is taken as `https`, so a host of files that speaks plain http to the engine on this computer gives `scheme=http`. It may be given several times. `topic.engine.web` says what each one does |
| `--web <name>=<value>` | One entry of the bounds of the web side, as `closeAfter='10 seconds'`. It may be given several times |
| `--reads <address>` | Runs a reader of the writer at that address, with its scheme. A reader needs no bundle, and runs in the mode of its writer. Its key is made on the writer with `tent access key add <name> --right copy`, or `--right far` for a far reader, or named in `readers` of `engine.open`. A reader keeps the history of its writer beside its data, with its own key, so that once it takes over it answers a pull and `tent publish --back` as its writer did |
| `--versions-from <address>` | Runs a server that follows another: it takes each new version of the server at that address by itself, as a publish does, with a key of the right `bundle` there, from the file that `--key-from` names or from `TENT_KEY`. With nothing running yet it first opens what is live there, and when that server goes back it goes back too. A version that is a hard switch while a run waits is not taken, and the log says so, unless `--stop-runs` is given |
| `--every <time>` | How often a server that follows asks: once a minute where it is left out |
| `--works <address>` | Runs a worker of the writer at that address: it holds no bundle and no data, and is handed the versions and the heavy work. See `topic.workers` |
| `--kinds <kinds>` | The kinds of worker it is, as `gpu,any`. A worker states at least one |
| `--at-once <n>` | How many tasks the worker takes at a time. Left out, it is 1 |
| `--load <names>` | The definitions the worker loads before it says that it is ready, as `encode,resize` |
| `--fetched <size>` | The size its fetched files are held to. Left out, it is `10 GB` |
| `--key-from <file>` | The file that holds the key of the reader, or of the worker. It is a file of the current user that no other user may read: one that another user may read, one that the current user does not own, and a link are refused before a byte is read, and the answer says how the file is closed |
| `--far` | The reader is a far one: no write waits for it |
| `--own <address>` | The address by which the other machines of the app reach this one |
| `--parts <address>` | An address of your own that serves every part which is fetched at its first use, for a server that may not reach the places the parts come from. The fingerprints are still those of the list that ships |
| `--sleep-after <time>` | The app falls asleep when nothing used it for that long, as `'15 minutes'`, and gives back its memory: a request for it, or something of it that is due, wakes it. Left out, it never sleeps. An app with readers never sleeps |
| `--insecure` | For machines on a network of their own: this machine reaches its writer, and is found, over a connection that is not secure |
| `--mail` | In the mode `development`, mail is sent in place of written to the log |
| `--count-by <limits, app or caller>` | The least that is counted of the app, for a host that bills its apps, as `option.project.countBy` says |
| `--count-every <time>`, `--level-every <time>`, `--caller-counts-kept <time>`, `--counts-kept <time>` | How often the counts are written and the levels measured, and how long they are kept |

## Example

```
tent start --port 8080 --mode test --seed
tent start /srv/shop --data /var/shop --domain shop.example.com,www.shop.example.com
```

## Output

When it has opened the app, it says on the standard error where the app runs. When the program is told to end, it closes its engine, and with `--json` prints what it ran:

```json
{ "ok": true, "value": { "app": "shop", "version": "f359ab2fd937cb70b23f404190efb7cc", "port": 8080, "mode": "test" }, "findings": [] }
```

The code of the app - a seed, a route, an action - runs in this program, and a file it reads by a path that is no whole one is read from the working folder of the program, the folder that `tent start` was typed in. The bundle holds no other file of the project than what the build put in it.

While it runs, `engine.json` in the data folder tells the other commands of this computer where the engine is reached. The engine makes the file anew at each start, readable by the current user alone, and removes it when it closes.

How a program ends it: no command ends an engine in this version. A program that started `tent start` ends it by the number of that program, which `engine.json` holds as `pid`, and which the program that started it knows as the number of its child:

```ts
const { pid } = JSON.parse(readFileSync('.tent/engine.json', 'utf8'))
process.kill(pid)
```

On Linux and macOS that tells the engine to end: it closes the app, removes `engine.json`, and the command prints what it ran. Ctrl+C in its terminal does the same on every system. On Windows a program that is ended by its number is ended at once and closes nothing: `engine.json` is left behind. That harms nothing. What was written is kept, since a write is on the disk before its call is answered, and a file whose program no longer runs is taken as no engine by every command and by the next `tent start`, which makes it anew.

## Errors

`code.T0011` for a folder that is no bundle, `code.T0018` for data that cannot be opened, `code.T2001` to `code.T2004` for a table change that is refused, with nothing changed, `code.T0013` for a data folder that an engine holds open already for a key file that is not kept as a key, and for a start as root without `--as-root`, and `code.T0029` for a reader whose writer is not reached.

## See also

`topic.commands`, `topic.engine`, `command.build`, `command.run`, `command.machines`, `command.take-over`, `command.service`
