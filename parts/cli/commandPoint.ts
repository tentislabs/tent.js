import { historyAsked } from './historyAsked.ts'

/**
 * Records a point of the kind `command` of a project, as a command that writes its files does before it writes and
 * after: through the session of development that runs it, or by itself where none runs.
 */
export async function commandPoint(folder: string, data?: unknown): Promise<void> {
  await historyAsked({ folder, data }, { what: 'command' })
}
