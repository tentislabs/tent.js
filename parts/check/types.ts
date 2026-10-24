import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Source } from '../build/index.ts'
import type { Finding } from '../core/index.ts'
import { finding } from '../core/internal.ts'
import { reactPaths } from './borrowed/react.ts'
import { runtimeTypes, startChecker } from './borrowed/typescript.ts'

const entry = (file: string): string[] => [fileURLToPath(new URL(`../${file}`, import.meta.url)).replaceAll('\\', '/')]
// The type checker reads every import of the framework as the very entry file that this part uses, a program's
// too, and the tags of a screen file by the types of React that the framework itself is checked with.
const paths = {
  tentjs: entry('core/index.ts'),
  'tentjs/ai': entry('ai/index.ts'),
  'tentjs/build': entry('build/index.ts'),
  'tentjs/check': entry('check/index.ts'),
  'tentjs/cli': entry('connect/cliEntry.ts'),
  'tentjs/connect': entry('connect/index.ts'),
  'tentjs/core': entry('core/internal.ts'),
  'tentjs/data': entry('data/index.ts'),
  'tentjs/docs': entry('docs/index.ts'),
  'tentjs/engine': entry('engine/index.ts'),
  'tentjs/engine/inside': entry('engine/rooms/inside/inside.ts'),
  'tentjs/flows': entry('flows/index.ts'),
  'tentjs/history': entry('history/index.ts'),
  'tentjs/publish': entry('publish/index.ts'),
  'tentjs/test': entry('test/index.ts'),
  'tentjs/ui': entry('screens/index.ts'),
  'tentjs/ui/draw': entry('screens/draw.ts'),
  'tentjs/workspaces': entry('workspaces/index.ts'),
  ...reactPaths(),
}

// What the type checker leaves out of the root of a project: a file of a clash, and the assets. `engine.ts` and
// `seed.ts`, which the build reads apart, are read as every other file is.
const leftInRoot = ['tent.clash.ts', 'assets']

// A screen file, a component and a package may import a style file. The declarations lie in a file of no module of
// their own beside the settings: in a file that imports, as the type list does, they would add to a module.
const styleModules = `declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
declare module '*.css'
`

/**
 * Writes the settings that the type checker is started with for a project, and answers where they lie. It reads
 * the files of the source, and every `.ts` and `.tsx` file of the folder by a pattern, the tests among them: so a
 * file added while it is kept running is read by its next pass. An import of a style file is found by the
 * declarations of style modules, which lie beside the settings.
 */
function settingsOf(folder: string, source: Source): string {
  const list = join(folder, 'tent.d.ts')
  const types = runtimeTypes()
  const root = folder.replaceAll('\\', '/')
  const settings = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: 'preserve',
      moduleResolution: 'bundler',
      target: 'esnext',
      allowImportingTsExtensions: true,
      jsx: 'react-jsx',
      skipLibCheck: true,
      // A style file that is imported for what it does to the page answers no module the checker could find.
      noUncheckedSideEffectImports: false,
      ...(types ? { types: ['node'], typeRoots: [types.replaceAll('\\', '/')] } : { types: [] }),
      paths,
    },
    // The type list stands first: the lists of the project are then filled before a file that reads them is read.
    files: [...(existsSync(list) ? [list] : []), ...Object.values(source).map((file) => file.file)].map((file) =>
      file.replaceAll('\\', '/'),
    ),
    include: [`${root}/**/*.ts`, `${root}/**/*.tsx`],
    exclude: [...leftInRoot.map((one) => `${root}/${one}`), `${root}/**/node_modules`, `${root}/**/*.d.ts`],
  }
  let kept = join(folder, '.tent', 'cache', 'types')
  try {
    mkdirSync(kept, { recursive: true })
  } catch {
    kept = join(tmpdir(), 'tent-types')
    mkdirSync(kept, { recursive: true })
  }
  const styles = join(kept, 'styles.d.ts')
  writeFileSync(styles, styleModules)
  const all = { ...settings, files: [...settings.files, styles.replaceAll('\\', '/')] }
  writeFileSync(join(kept, 'tsconfig.json'), `${JSON.stringify(all, null, 2)}\n`)
  return join(kept, 'tsconfig.json')
}

/**
 * The fix of what the type checker found. A row holds a link as the id of the other row, a text, so a field read
 * through it is not there: the fix names `.with`, which reads the linked row into the answer of the query.
 */
function fixOf(number: string, said: string, line: string): string {
  const field = /^Property '(\w+)' does not exist on type 'string'/.exec(said)?.[1]
  const link = field === undefined ? undefined : new RegExp(`(\\w+)\\??\\.${field}\\b`).exec(line)?.[1]
  if (number !== 'TS2339' || link === undefined) return 'Mend what the type checker names.'
  return `Where \`${link}\` is a link, its row is read by the query with \`.with('${link}')\`: see \`tent docs topic.plans\`. Else mend what the type checker names.`
}

/** The line of a file as it stands now, counted from 1, or nothing where it cannot be read. */
function lineOf(file: string, line: number): string {
  try {
    return readFileSync(file, 'utf8').split(/\r?\n/)[line - 1] ?? ''
  } catch {
    return ''
  }
}

/**
 * Turns what the type checker printed into findings: each with the checker's own number in its message, at the
 * file by its path in the project. An error that names no place, as one of the settings or of a file they name,
 * is a finding with no place. The fix reads the line as the file stands, which a later pass read after a save.
 */
function findingsOf(folder: string, printed: string): Finding[] {
  const found: Finding[] = []
  for (const line of printed.split('\n')) {
    const read = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line.trim())
    const unplaced = read ? undefined : /^error (TS\d+): (.*)$/.exec(line.trim())
    if (unplaced)
      found.push(finding('T8000', `${unplaced[1]}: ${unplaced[2]}`, { fix: 'Mend what the type checker names.' }))
    if (!read) continue
    const lies = isAbsolute(read[1]) ? read[1] : resolve(folder, read[1])
    found.push(
      finding('T8000', `${read[3]}: ${read[4]}`, {
        fix: fixOf(read[3], read[4], lineOf(lies, Number(read[2]))),
        where: { file: relative(folder, lies).replaceAll('\\', '/'), line: Number(read[2]) },
      }),
    )
  }
  return found
}

/**
 * Takes the folder of a project and its source. Starts the type checker over the whole project, with the type
 * list of the project first, and answers what it reported, each as a finding T8000. Throws where the type
 * checker cannot be started, and where it ends with a failure that it reported no error for.
 */
export function checkTypes(folder: string, source: Source): Promise<Finding[]> {
  const checker = startChecker(folder, ['-p', settingsOf(folder, source), '--pretty', 'false'])
  let printed = ''
  checker.stdout?.on('data', (piece) => {
    printed += String(piece)
  })
  checker.stderr?.on('data', (piece) => {
    printed += String(piece)
  })
  return new Promise((done, failed) => {
    checker.on('error', failed)
    checker.on('close', (code, signal) => {
      const found = findingsOf(folder, printed)
      // A checker that failed and named no error checked nothing, so the project is not taken to pass.
      if (code === 0 || found.length) done(found)
      else {
        const last = printed.trim().split('\n').at(-1)
        const how = signal ? `by ${signal}` : `with the number ${code}`
        failed(new Error(`the type checker ended ${how} and named no error${last ? `: ${last}` : ''}`))
      }
    })
  })
}

/** How long, in milliseconds, no other pass may begin after a pass before that pass answers for a save. */
const quiet = 150

/**
 * Takes the folder of a project and its source. Starts the type checker and keeps it running: it checks the
 * project again whenever a file of it is saved. Answers `next`, which is called after a save and answers what
 * the pass that read the saved file reported: a pass that began after the call, and that no other pass follows
 * at once. A pass that was under way, and may have read the file as it was before, answers nobody, and neither
 * does one that began while the file was still being written. Called before anything was saved, it answers the
 * first pass. And `stop`, which ends the type checker. Where the type checker ends by itself, or cannot be
 * started, `next` throws: what waits then, and whatever asks after.
 */
export function keepTypes(folder: string, source: Source): { next(): Promise<Finding[]>; stop(): void } {
  const checker = startChecker(folder, ['-p', settingsOf(folder, source), '--pretty', 'false', '--watch'])
  let unread = ''
  let printed = ''
  // The number of passes that began so far, and for each call that waits the number that had begun when it was made.
  let began = 0
  let calls = 0
  let first: Finding[] | undefined
  let waiting: { after: number; done(found: Finding[]): void; failed(why: Error): void }[] = []
  let settling: ReturnType<typeof setTimeout> | undefined
  let said = ''
  let stopped = false
  let ended: Error | undefined
  // No pass follows the end of the type checker, so what waits for one is told so, and waits no longer.
  const end = (why: string): void => {
    if (stopped || ended) return
    ended = new Error(why)
    clearTimeout(settling)
    for (const one of waiting) one.failed(ended)
    waiting = []
  }
  checker.on('error', (error) => end(`the type checker cannot be started: ${error.message}`))
  checker.on('close', (code, signal) => {
    const last = said.trim().split('\n').at(-1)
    end(
      `the type checker ended by itself, ${signal ? `by ${signal}` : `with the number ${code}`}${last ? `: ${last}` : ''}`,
    )
  })
  checker.stderr?.on('data', (piece) => {
    said += String(piece)
  })
  checker.stdout?.on('data', (piece) => {
    unread += String(piece)
    const lines = unread.split('\n')
    unread = lines.pop() ?? ''
    for (const line of lines) {
      // The type checker says when a pass begins, and ends each pass with the number of errors it found.
      if (/Starting (?:incremental )?compilation/.test(line)) {
        began++
        printed = ''
        clearTimeout(settling)
      } else if (/Found \d+ errors?\. Watching for file changes\./.test(line)) {
        const found = findingsOf(folder, printed)
        const pass = began
        first ??= found
        // A system may tell of one save twice, first when the file is emptied and then when it is written: a pass
        // that began at the first read a file that was not whole, and a second pass follows it within a moment.
        // So a pass answers once no other has begun for a moment after it.
        clearTimeout(settling)
        settling = setTimeout(() => {
          const answered = waiting.filter((one) => one.after < pass)
          waiting = waiting.filter((one) => one.after >= pass)
          for (const one of answered) one.done(found)
        }, quiet)
      } else printed += `${line}\n`
    }
  })
  return {
    next: () =>
      new Promise((done, failed) => {
        // The first call asks for the first pass, whether that has ended, is under way or has not begun.
        const asked = calls++
        if (ended) failed(ended)
        else if (!asked && first) done(first)
        else waiting = [...waiting, { after: asked ? began : 0, done, failed }]
      }),
    stop: () => {
      stopped = true
      clearTimeout(settling)
      checker.kill()
    },
  }
}
