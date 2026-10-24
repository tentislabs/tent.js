import type { Rule } from './rule.ts'
import { writtenIn } from './rule.ts'

/**
 * Takes one of the codes of a table change, T2001 to T2004. Answers the rule that passes on what the data of a
 * running app found under that code, and compares nothing itself. A description keeps no file and no line, so the
 * rule adds the place of each finding: the table that the finding names, found by its name in the source, and
 * the project, where `removed` is stated, for a table that the source no longer holds.
 */
export function passedOn(code: string): Rule {
  return {
    code,
    needs: ['source', 'facts'],
    run: ({ source, facts }) => {
      const written = writtenIn(source)
      const project = written.find((one) => one.word === 'project')
      return (facts?.tableFindings ?? [])
        .filter((one) => one.code === code)
        .map((one) => {
          // The data names a table, and a column as its table and its own name, each between two backticks.
          const names = [...one.message.matchAll(/`([^`]+)`/g)].map((named) => named[1].split('.')[0])
          const tables = names.map((name) => written.find((at) => at.word === 'table' && at.name === name))
          const at = tables.find((found) => found !== undefined) ?? project
          return at ? { ...one, where: { file: at.path, line: at.line, definition: at.name } } : one
        })
    },
  }
}
