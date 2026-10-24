import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { writtenIn } from '../rule.ts'

// What each kind of way out that the hold names opens, in the words of the note.
const opens: Record<string, (name: string) => string> = {
  net: (name) => `The app may reach ${name} with \`fetch\`.`,
  programs: (name) => `The engine may start the program ${name} for the app.`,
  native: (name) =>
    `The room may load the native module ${name}, which runs outside the permission model and so lifts the hold for the whole room.`,
}

/**
 * Each host, program and native module that `hold` of `project` names, so that whoever reads the check sees every
 * way out the hold leaves open. A note, at the project.
 */
export const rule: Rule = {
  code: 'T7016',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const hold = description.project.hold
    if (hold === undefined || hold === null || hold === true || typeof hold !== 'object') return []
    const project = writtenIn(source).find((one) => one.word === 'project')
    const where = project ? { file: project.path, line: project.line } : undefined
    const found: Finding[] = []
    for (const field of ['net', 'programs', 'native']) {
      const list = Reflect.get(hold, field)
      if (!Array.isArray(list)) continue
      for (const name of list)
        found.push(
          finding(
            'T7016',
            opens[field](String(name)),
            {
              fix: 'Nothing to mend where this way out is meant. Take the entry out of `hold` where the app does not need it.',
              ...(where ? { where } : {}),
            },
            'note',
          ),
        )
    }
    return found
  },
}
