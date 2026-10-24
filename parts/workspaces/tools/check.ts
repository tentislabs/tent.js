import { checkProject } from '../../check/index.ts'
import { checkedInBox } from '../opening.ts'
import type { ProjectTool } from './face.ts'

/** `check`: the findings of the check of the project, our own rules and the type checker. */
export const checkTool: ProjectTool = {
  name: 'check',
  about: 'Checks the project and answers every finding, each with its code, its place and how it is mended.',
  input: {},
  writes: false,
  async run(at) {
    const { one, form } = at
    // The code of a workspace in a box is built and checked there: the check of the host would run it.
    if (form === 'box') return { findings: (await checkedInBox(at.held, one, 'dev')).findings }
    const { findings } = await checkProject(one.folders.project)
    return { findings }
  },
}
