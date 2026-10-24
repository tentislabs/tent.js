import type { Description } from '../../core/internal.ts'
import { hasCommands } from '../cli/commands.ts'
import { offersToMcp } from '../mcp/offers.ts'

/** Whether an app has sign-in for programs: it offers something to MCP, or it has a command line. */
export const signsInPrograms = (description: Description): boolean =>
  offersToMcp(description) || hasCommands(description)

/** Whether the app's own command line may sign in in the browser: it has commands, and `cli.login` is not `'key'`. */
export const cliSignsIn = (description: Description): boolean =>
  hasCommands(description) && Reflect.get(Object(description.project.cli), 'login') !== 'key'
