import { TentError } from '../core/index.ts'
import { ownEngineFile } from '../engine/index.ts'

/**
 * Takes the data folder of the app of a test. Answers the admin token that its engine wrote into `engine.json`, by
 * which the command line and MCP of the test are this computer. Throws T0013 where the file holds none.
 */
export function adminTokenOf(dataFolder: string): string {
  const token = ownEngineFile(dataFolder)?.token
  if (token === undefined)
    throw new TentError('T0013', `The engine of ${dataFolder} wrote no admin token.`, {
      fix: 'Open the test app before it is called from its command line or over MCP.',
    })
  return token
}
