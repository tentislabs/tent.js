import { TentError } from '../../core/index.ts'
import { underWay } from '../context.ts'
import { handleGiven } from '../given.ts'
import { givenHandle } from '../givenHandle.ts'
import type { Opened } from '../opened.ts'

// The members of the handle, which the program that made the workspaces gives the work of.
const members = ['create', 'get', 'list', 'remove', 'values', 'mail', 'publish', 'tool', 'turn', 'turns', 'undo']

/**
 * The working object behind the handle `workspaces`: each member is carried out by what the program that made the
 * workspaces of this app gave with `engine.give('handle', 'workspaces', ...)`, handed the caller of the call. It is
 * full access: T0013 in code that has none, and in an app that no program gave workspaces.
 */
export const handle = (o: Opened): object =>
  Object.fromEntries(
    members.map((name) => [
      name,
      (...args: unknown[]): unknown => {
        const cx = underWay()
        const given = handleGiven(o, 'workspaces')
        if (!cx || !given)
          throw new TentError('T0013', `\`workspaces.${name}\` was used in an app that no program gave workspaces.`, {
            fix: 'Make the workspaces of the app with `createWorkspaces` of `tentjs/workspaces`, in the program that holds it.',
          })
        const found: unknown = Reflect.get(givenHandle(given, 'workspaces', cx), name)
        if (typeof found !== 'function') throw new TentError('T0013', `The workspaces of the app give no \`${name}\`.`)
        return Reflect.apply(found, undefined, args)
      },
    ]),
  )
