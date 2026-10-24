// The entry `tentjs/cli`, which a command file imports: `command`, the value words and the rules it is typed with,
// and the types of what its `run` is handed. The runner answers this name with this file when it loads a module.
export type { CommandRun, RunPart, Stub, Terminal } from '../core/index.ts'
export {
  anyone,
  boolean,
  choice,
  command,
  date,
  day,
  file,
  json,
  link,
  list,
  number,
  object,
  role,
  text,
} from '../core/index.ts'
