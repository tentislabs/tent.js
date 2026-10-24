import { existsSync, readFileSync, statSync } from 'node:fs'
import { number, TentError, text } from '../../core/index.ts'
import { pathIn, pathOf } from '../paths.ts'
import type { ProjectTool } from './face.ts'
import { notShown, shownFile } from './shown.ts'

/** `read`: the text of a file of the project, or of its lines from `from` to `to`, counted from 1. */
export const readTool: ProjectTool = {
  name: 'read',
  about: 'The text of a file of the project, or of some of its lines.',
  input: {
    path: text(),
    from: number({ min: 1, optional: true }),
    to: number({ min: 1, optional: true }),
  },
  writes: false,
  async run(at, input) {
    const path = String(input.path)
    const place = pathIn(at.one.folders.project, path, { writes: false })
    if (
      !existsSync(place) ||
      !statSync(place).isFile() ||
      !(await shownFile(at, pathOf(at.one.folders.project, place)))
    )
      throw notShown(path)
    const whole = readFileSync(place, 'utf8')
    if (input.from === undefined && input.to === undefined) return { path, text: whole }
    const lines = whole.replace(/\r\n/g, '\n').split('\n')
    const from = Number(input.from ?? 1)
    const to = Number(input.to ?? lines.length)
    if (to < from)
      throw new TentError('T0002', 'A read of lines names a `to` that is not below its `from`.', {
        fields: { to: 'min' },
      })
    return { path, from, to, text: lines.slice(from - 1, to).join('\n') }
  },
}
