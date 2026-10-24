# `Sandbox`

A place that a host connects where a command runs on a project's files, and nothing else: the build of a project whose code is not the host's, and its installing. Nothing ships: with no sandbox a workspace that holds code of anyone else is neither built nor run, and a plain one is taken all the same.

## Interface

```ts
interface Sandbox {
  start(o: { id: string; owner: string; folder: string; work: string }): Promise<Box>
  run(box: Box, command: string, o?: { signal?: AbortSignal }): Promise<Ran>
  stop(box: Box): Promise<void>
}
interface Box { id: string; folder: string; work: string }   // the two folders, as their paths read inside the box
interface Ran { code: number; out: string; err: string }
```

`start` is handed the id of a workspace, its owner, the folder of its project, which the box shows to what runs inside with every later change and lets nothing write, and `work`, a folder that the code in the box may write and that outlives the box. It answers both as their paths read inside the box, and for an id whose box stands it answers that box, so a host program that started again finds its boxes. `run` starts a command and answers when it has ended; `signal` ends it, when the call that asked for it ended or its time is up. How much of what was printed `Ran` holds is the host's to bound. `stop` ends the box and everything in it; `work` stays.

The commands that `run` is handed are three, each run in the folder of the project as the box shows it, and the workspaces read the JSON each prints: `tent check --json`; `tent build --dev --out "<work>/builds/<n>" --json`, the development build of the test side, which the inspect mode reads the places of a page from; and `tent build --out "<work>/builds/<n>" --json`, the release of what is published. `tent` there is Tent.js of the version that the engine runs, which the host installs in the box as on any computer (`topic.start`), and which the box runs as its own command.

What a box is made of - a program with no rights, a container, a machine - and how much of a processor, of memory, of the disk and of the network it gives are the host's to choose: the engine hands a box no limit and reads none. What crosses its wall: the project's files to read, the command, what it printed and how it ended, and what it wrote into `work` - a bundle, which the host reads as data and hands to an engine, whose room loads its code (`adapter.Room`). Nothing else crosses: no data, no secret, no request.

A sandbox may have `close`, which the engine calls when the app that made it is closed.

## Example

```ts
import { createEngine, type Sandbox } from 'tentjs/engine'
import { roomOfMyOwn } from './rooms.ts'

const sandbox: Sandbox = roomOfMyOwn({ memory: '1 GB' })
const engine = createEngine({ makers: { sandbox: () => sandbox } })
```

## See also

`topic.workspaces`, `adapter.Room`, `code.T9105`
