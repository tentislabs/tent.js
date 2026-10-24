import { text } from '../../core/index.ts'
import { writeHeld } from '../written.ts'
import type { ProjectTool } from './face.ts'

/** `write`: a whole file of the project, new or in the place of the one that stands. */
export const writeTool: ProjectTool = {
  name: 'write',
  about:
    'Writes a whole file of the project. Write one definition to a file, in the folder of its kind: tables/, functions/, flows/, screens/, components/.',
  input: { path: text(), text: text({ lines: 'many' }) },
  writes: true,
  async run(at, input) {
    const path = String(input.path)
    const { point } = await writeHeld(at, [{ path, text: String(input.text) }], { tool: 'write' })
    return { path, point: point.id }
  },
}
