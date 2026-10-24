import { changedByTool as changedBy } from './changedBy.ts'
import { checkTool as check } from './check.ts'
import { compareTool as compare } from './compare.ts'
import { docsTool as docs } from './docs.ts'
import { editTool as edit } from './edit.ts'
import type { ProjectTool } from './face.ts'
import { historyTool as history } from './history.ts'
import { impactTool as impact } from './impact.ts'
import { logsTool as logs } from './logs.ts'
import { mapTool as map } from './map.ts'
import { readTool as read } from './read.ts'
import { removeTool as remove } from './remove.ts'
import { renameTool as rename } from './rename.ts'
import { rowsTool as rows } from './rows.ts'
import { runTool as run } from './run.ts'
import { searchTool as search } from './search.ts'
import { shotTool as shot } from './shot.ts'
import { writeTool as write } from './write.ts'

/** Every project tool, by its name, in the order of their table. */
export const projectTools: ReadonlyMap<string, ProjectTool> = new Map(
  [
    map,
    read,
    search,
    docs,
    edit,
    write,
    rename,
    remove,
    check,
    run,
    rows,
    logs,
    shot,
    history,
    compare,
    changedBy,
    impact,
  ].map((one) => [one.name, one]),
)
