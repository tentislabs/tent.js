import { existsSync, readFileSync } from 'node:fs'
import { TentError, text } from '../../core/index.ts'
import { pathIn, pathOf } from '../paths.ts'
import { writeHeld } from '../written.ts'
import type { ProjectTool } from './face.ts'
import { notShown, shownFile } from './shown.ts'

/** How often a text stands in another, each place counted once and none inside another. */
function timesIn(whole: string, part: string): number {
  let times = 0
  for (let at = whole.indexOf(part); at >= 0; at = whole.indexOf(part, at + part.length)) times += 1
  return times
}

/** `edit`: puts `with` in the place of `find` in one file, where `find` stands in it exactly once. */
export const editTool: ProjectTool = {
  name: 'edit',
  about:
    'Puts one text in the place of another in one file of the project. The text to replace must stand in the file exactly once.',
  input: { path: text(), find: text({ min: 1, lines: 'many' }), with: text({ lines: 'many' }) },
  writes: true,
  async run(at, input) {
    const path = String(input.path)
    const place = pathIn(at.one.folders.project, path, { writes: true, engine: at.policy.also.includes('engine') })
    // A file that `read` does not show is edited as one that is not there: no count tells what it holds.
    if (!existsSync(place) || !(await shownFile(at, pathOf(at.one.folders.project, place)))) throw notShown(path)
    const whole = readFileSync(place, 'utf8')
    const find = String(input.find)
    const times = timesIn(whole, find)
    if (times !== 1)
      throw new TentError('T9106', `The text to replace stands ${times} times in ${path}, and not exactly once.`, {
        fields: { count: String(times) },
        fix:
          times === 0
            ? 'Read the file again, and replace a text that stands in it.'
            : 'Take more of the text around it, so that it stands once.',
      })
    const at0 = whole.indexOf(find)
    const changed = `${whole.slice(0, at0)}${String(input.with)}${whole.slice(at0 + find.length)}`
    const { point } = await writeHeld(at, [{ path, text: changed }], { tool: 'edit' })
    return { path, point: point.id }
  },
}
