// Where each test file of the framework's own runs, as Next.js runs its own: Linux runs every file, and Windows and
// macOS the files of `tests/systems.txt` alone, whose point is a difference between systems; a file of
// `tests/browsers.txt`, whose point is a difference between browsers, goes through the three engines, and every
// other through Chromium alone.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The test files that a list of a tree names, one path from the tree on each line. Takes the folder of the tree and
 * the path of the list, from the tree or whole. Answers the paths, written with `/`, and none where there is no list.
 */
export function listed(tree: string, list: string): string[] {
  const file = resolve(tree, list)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter(Boolean)
}

/** Whether a test file, by its path from the tree, goes through the three engines: where `tests/browsers.txt` names it. */
export const inEveryEngine = (file: string, tree: string): boolean => listed(tree, 'tests/browsers.txt').includes(file)
