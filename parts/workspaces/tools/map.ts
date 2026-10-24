import { outline } from '../../core/internal.ts'
import { describedNow } from '../written.ts'
import type { ProjectTool } from './face.ts'

/** `map`: the whole project as a short outline, as `tent map` prints it. */
export const mapTool: ProjectTool = {
  name: 'map',
  about:
    'The whole app as a short outline: each table with its columns, each function with its inputs and its rule, each flow with its steps, each screen with its address.',
  input: {},
  writes: false,
  async run(at) {
    const { description } = await describedNow(at)
    return { outline: description ? outline(description) : '' }
  },
}
