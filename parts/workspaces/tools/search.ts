import { readFileSync, statSync } from 'node:fs'
import { number, text } from '../../core/index.ts'
import { pathIn, pathOf } from '../paths.ts'
import { projectFiles } from '../projectFiles.ts'
import type { ProjectTool } from './face.ts'
import { shownFile } from './shown.ts'

// How many lines a search answers where it names no `limit`.
const most = 100

/** `search`: the files and the lines that hold a text, in the whole project or in the folder or file `in` names. */
export const searchTool: ProjectTool = {
  name: 'search',
  about: 'The files and the lines of the project that hold a text, each with its line number.',
  input: {
    text: text({ min: 1 }),
    in: text({ optional: true }),
    limit: number({ min: 1, max: 1000, optional: true }),
  },
  writes: false,
  async run(at, input) {
    const project = at.one.folders.project
    const under = input.in === undefined ? project : pathIn(project, input.in, { writes: false })
    const wanted = String(input.text)
    const limit = Number(input.limit ?? most)
    const found: { path: string; line: number; text: string }[] = []
    for (const place of statSync(under).isFile() ? [under] : projectFiles(under)) {
      const path = pathOf(project, place)
      if (!(await shownFile(at, path))) continue
      const lines = readFileSync(place, 'utf8').replace(/\r\n/g, '\n').split('\n')
      for (const [k, line] of lines.entries()) {
        if (!line.includes(wanted)) continue
        found.push({ path, line: k + 1, text: line })
        if (found.length >= limit) return { found }
      }
    }
    return { found }
  },
}
