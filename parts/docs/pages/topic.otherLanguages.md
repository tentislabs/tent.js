# Code in other languages

An app is written in TypeScript, and Tent.js runs Python itself. Code in Rust, Go or any other language joins an app in one of four ways: a native package from npm, WebAssembly, an outside MCP server program, or an HTTP service of its own. This page says how each is done, what each fits best, and where each runs.

## Python

A `python` is a definition of its own: the engine fetches Python, installs the packages of the project's lock, and calls the `run` of a `.py` file as it calls an action, from a screen, from code, as a step or as a tool. See `word.python` and `command.python`.

## A native package from npm

A native package is code of another language, built for each system as a module that the runtime loads (a Node-API addon). An action imports it by its name, as any package (`command.add`), and calls it as a function.

For Rust, napi-rs makes one. A function marked `#[napi]` is a function of the package:

```rust
// fast/src/lib.rs
use napi_derive::napi;

#[napi]
pub fn fibonacci(n: u32) -> u32 {
  if n < 2 { n } else { fibonacci(n - 1) + fibonacci(n - 2) }
}
```

`napi build --platform --release` builds it for the system it runs on, and its release workflow builds it for each other system and publishes each as a package of its own, which the main package names as optional, so npm takes the one for the computer it installs on. Then:

```sh
tent add @shop/fast
```

```ts
// functions/fibonacci.ts
import { action, number, role } from 'tentjs'
import { fibonacci } from '@shop/fast'

export const fib = action('fib', {
  access: role('staff'),
  input: { n: number({ whole: true, min: 0, max: 40 }) },
  output: number(),
  run: async ({ input }) => fibonacci(input.n),
})
```

A package that ships its files ready-built for each system, as those of napi-rs do, installs with no script. One that builds its native part on the computer while it is installed needs `tent add <package> --allow-scripts`, and a compiler on that computer.

**Fits best** code that must be as fast as the machine allows, or that wraps a library of the system: pictures, sound, compression, a parser. A call answers at once, with no crossing between programs.

**Where it runs.** In the app's room (`adapter.Room`), in the program that runs the app's actions: the engine's own program where nothing else is stated. Native code runs outside the runtime's checks, so a crash in it ends that program with the app's other work in it: for code that may crash, the MCP server program and the HTTP service below run in a program of their own. With `hold` of `project`, the package is named in `native` (`option.project.hold`), which lifts the hold for the whole room.

## WebAssembly

Rust and Go both build WebAssembly: one file of code that runs the same on every system and every machine, workers among them, with nothing built for each system. An action loads it with `WebAssembly.instantiate` and calls what it exports.

Built from Rust, with `crate-type = ["cdylib"]` in `Cargo.toml`:

```rust
// fib/src/lib.rs
#[no_mangle]
pub extern "C" fn fibonacci(n: u32) -> u32 {
  if n < 2 { n } else { fibonacci(n - 1) + fibonacci(n - 2) }
}
```

```sh
cargo build --release --target wasm32-unknown-unknown
```

Built from Go, with TinyGo, a function marked `//export fibonacci` is exported the same way: `tinygo build -o fib.wasm -target wasm-unknown ./fib`.

The bytes travel inside the code of the app, so the build carries them into the bundle as it carries every module. A small program of the project writes them into a file of text, once after each build of the WebAssembly:

```js
// tools/embed.mjs: node tools/embed.mjs fib.wasm lib/fib.ts
import { readFileSync, writeFileSync } from 'node:fs'

const [from, to] = process.argv.slice(2)
writeFileSync(to, `export const wasm = '${readFileSync(from).toString('base64')}'\n`)
```

```ts
// functions/fibonacci.ts
import { action, number, role } from 'tentjs'
import { wasm } from '../lib/fib.ts'

export const fib = action('fib', {
  access: role('staff'),
  input: { n: number({ whole: true, min: 0, max: 40 }) },
  output: number(),
  run: async ({ input }) => {
    const { instance } = await WebAssembly.instantiate(Buffer.from(wasm, 'base64'))
    const fibonacci = instance.exports.fibonacci
    if (typeof fibonacci !== 'function') throw new Error('fib.wasm exports no fibonacci')
    return fibonacci(input.n)
  },
})
```

`lib/fib.ts` imports neither `tentjs` nor `tentjs/ui`, so it is a helper file that a backend file may import. A package from npm that carries its WebAssembly inside its JavaScript is imported as any package. In a page, WebAssembly runs once `unlock: { wasm: true }` of `project` opens the content policy to it (`option.project.unlock`).

**Fits best** work that is computation alone - a parser, a codec, a solver, the same rules on the server and in the browser - and code of another language that must run on every system with no build for each. WebAssembly reaches only what it is handed, and answers what it works out: the action reads the data and the files and hands them in.

**Where it runs.** In the app's room, on the thread of the call that runs it, as any code of the app. It opens no way out of the computer, so `hold` names nothing for it. The room of the hold starts no WASI, so a module is built for plain WebAssembly, as the two commands above build it: `wasm32-unknown-unknown` for Rust and `wasm-unknown` for TinyGo.

## An outside MCP server program

An MCP server is a program in any language that offers tools by the Model Context Protocol, and most languages have an SDK for writing one: Go, Rust, Python, Java, C# and others. A `service` that states `mcp: { command }` is such a program, which the engine starts and speaks to over its input and its output. An agent that names the service in `tools` is offered each of its approved tools.

```ts
// services/maps.ts
import { secret, service } from 'tentjs'

export const maps = service('maps', {
  mcp: { command: ['maps-server', '--stdio'], env: { MAPS_KEY: secret('MAPS_KEY') } },
})
```

```ts
// agents/planner.ts
import { agent } from 'tentjs'
import { writer } from '../models/writer'
import { maps } from '../services/maps'

export const planner = agent('planner', {
  model: writer,
  instructions: 'You plan deliveries, and find each address on the map.',
  tools: [maps],
  limits: { steps: 12, perRun: { tokensOut: 50000 } },
})
```

`tent mcp approve maps` asks the program for its tools, shows each, and writes them into `mcp.lock.json`: a tool that changed since is held back (`code.T7112`). A server on another machine is a `service` with `url` and `mcp: true` (`option.service.mcp`).

**Fits best** what an agent should use as tools, in whatever language its makers wrote it: an existing MCP server, or one of the builder's own that keeps a state for its client, as a browser it drives. A tool of it counts as one that sends data out, so a person is asked first unless `trust` names it.

**Where it runs.** In a program of its own, which the app's room starts when the app opens, in the folder of the bundle, with no shell and without the engine's secrets: what it needs, `env` hands it. The program is the machine's own, named by its name on the path or by its whole path, so it is installed where the engine runs. It is started again when it ends by itself, and ended with the app; `per: 'user'` starts one for each user. A crash of it ends that program alone. With `hold`, the program is named in `programs`.

## An HTTP service of its own

Code in any language that answers HTTP is a `service`: each of its calls is a function, which an action calls with its input and which answers its typed output. An action that calls it is a tool of an agent like any action.

```ts
// services/pricing.ts
import { list, number, object, post, secret, service, text } from 'tentjs'

export const pricing = service('pricing', {
  url: 'https://pricing.shop.example',
  auth: { bearer: secret('PRICING_KEY') },
  calls: {
    quote: post('/quote', { input: { items: list(text()) }, output: object({ total: number() }) }),
  },
})
```

```ts
// functions/quote.ts
import { action, list, number, role, text } from 'tentjs'
import { pricing } from '../services/pricing'

export const quote = action('quote', {
  access: role('staff'),
  input: { items: list(text()) },
  output: number(),
  run: async ({ input }) => (await pricing.quote({ items: input.items })).total,
})
```

A service on this computer or in a private network is listed in `privateHosts` of `project`, as `'http://10.0.0.5:8080'` (`option.project.privateHosts`): the guarded fetch reaches no such address otherwise.

**Fits best** a large program of its own, with its own team, its own release and its own machines: heavy work on hardware of its own, a system that stands already, or code that several apps share. It grows and is published apart from the app.

**Where it runs.** On its own machine, or on this one in a program of its own. The engine reaches it through the guarded fetch, with the auth, the limits, the tries and the log of every service (`word.service`).

## Which way

| Way | Fits best | Runs | A crash of it ends |
|---|---|---|---|
| A native package | The fastest code, a library of the system | In the app's room | The program of the app's actions |
| WebAssembly | Computation alone, the same on every system | In the app's room, on the thread of the call | The call |
| An MCP server program | Tools for an agent | In a program of its own, started by the app's room | That program |
| An HTTP service | A program of its own team, on machines of its own | Where it is hosted | Nothing of the app |

## See also

`word.python`, `command.add`, `word.service`, `option.service.mcp`, `topic.mcp`, `option.project.hold`, `option.project.privateHosts`, `adapter.Room`, `topic.workers`
