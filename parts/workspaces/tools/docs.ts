import { TentError, text } from '../../core/index.ts'
import { findPage } from '../../docs/index.ts'
import type { ProjectTool } from './face.ts'

/** `docs`: a page of the shipped docs, by its name or by the name of its thing. */
export const docsTool: ProjectTool = {
  name: 'docs',
  about:
    'A page of the docs of the installed version, by its name, as `word.table`, or by the name of its thing, as `table` or `T1003`.',
  input: { topic: text({ min: 1, max: 200 }) },
  writes: false,
  async run(_, input) {
    const topic = String(input.topic)
    // A page is found by its name alone: no name of a page holds a slash or two dots.
    const page = /^[A-Za-z0-9_.-]+$/.test(topic) && !topic.includes('..') ? findPage(topic) : undefined
    if (!page)
      throw new TentError('T0001', `No page of the docs is named ${JSON.stringify(topic).slice(0, 80)}.`, {
        fix: 'Name a page as `word.table`, `command.check`, `code.T1003` or `topic.flows`.',
      })
    return page
  },
}
