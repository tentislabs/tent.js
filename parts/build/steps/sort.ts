import { resolve } from 'node:path'
import type { Scan } from '../read/scan.ts'
import { sorts } from '../read/scan.ts'
import { scanned } from '../lookups.ts'
import { keptPath, namedFile, sourceFile } from '../source.ts'
import { kid, kids, nameOf, propertyOf, unwrap } from '../tree.ts'
import type { SourceFile, Step, Work } from '../work.ts'
import { found } from '../work.ts'

/** The folders that `roots` of the project names, read from the text of the project's file. */
function rootsOf(work: Work): string[] {
  for (const file of work.files.values()) {
    const project = file.seen?.declared.find((one) => one.word === 'project')
    const written = kid(propertyOf(project?.options, 'roots'), 'value')
    if (written && unwrap(written).type === 'ArrayExpression')
      return kids(unwrap(written), 'elements')
        .map((one) => (one.type === 'Literal' && typeof one.value === 'string' ? one.value : undefined))
        .filter((one) => one !== undefined)
        .map((one) => resolve(work.folder, one))
  }
  return []
}

/** Whether a screen file exports `messages(...)` of `tentjs/ui` as its default: then it is a language file. */
function isLanguageFile(seen: Scan): boolean {
  const call = seen.byDefault ? unwrap(seen.byDefault) : undefined
  const callee = call?.type === 'CallExpression' ? nameOf(kid(call, 'callee')) : undefined
  return seen.imports.some((one) => one.from === 'tentjs/ui' && one.name === 'messages' && one.local === callee)
}

function sortOf(work: Work, file: SourceFile): void {
  if (!file.tree) {
    file.sort = 'refused'
    return
  }
  file.seen = scanned(file.tree)
  const [first, second] = file.seen.sorts
  file.sort = second ? 'refused' : (first ?? 'helper')
  if (file.sort === 'screen' && isLanguageFile(file.seen)) file.sort = 'messages'
  if (second) {
    const imports = file.seen.sorts.map(
      (one) => `\`${one === 'backend' ? 'tentjs' : one === 'screen' ? 'tentjs/ui' : 'tentjs/cli'}\``,
    )
    found(
      work,
      'T1005',
      file,
      file.seen.named.find((one) => sorts[one.from] === second)?.node,
      `The file ${file.path} imports ${imports.join(' and ')}. A file imports from one of \`tentjs\`, \`tentjs/ui\` and \`tentjs/cli\`, never two of them.`,
      'Move the definitions of one side into a file of their own, which imports that side alone. A helper that both sides use lives in a file that imports neither.',
    )
  }
}

/** Sorts every file by what it imports, and holds each file that the project names to its folder and its roots. */
export const step: Step = {
  order: 2,
  run: async (work) => {
    for (const file of work.files.values()) sortOf(work, file)
    work.roots = rootsOf(work)
    // A file of a root that the project names is a file of the project, and so is what that file names.
    const waiting = [...work.files.values()]
    for (let file = waiting.shift(); file; file = waiting.shift()) {
      for (const named of file.seen?.named ?? []) {
        if (!named.from.startsWith('.')) continue
        const target = namedFile(file.file, named.from)
        if (!target) continue
        const path = keptPath(work, target)
        if (path === undefined)
          found(
            work,
            'T1014',
            file,
            named.node,
            `The file ${file.path} names \`${named.from}\`, which lies outside the folder of the project.`,
            'Move the file into the project, or name its folder in `roots` of `project`.',
          )
        else if (/\.tsx?$/.test(target) && !work.files.has(path)) {
          const added = sourceFile(path, target)
          work.files.set(path, added)
          sortOf(work, added)
          waiting.push(added)
        }
      }
    }
  },
}
