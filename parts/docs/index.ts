import { readFileSync } from 'node:fs'
import { list } from './pages/list.ts'

/** The kinds of page, in the order in which a bare name is looked for among them. */
const kinds = ['code', 'command', 'word', 'topic', 'tag', 'hook', 'handle', 'adapter', 'option']

const textOf = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

/** The pages that walk one app from nothing, in the order they are read: the first page of the docs. */
export const firstPages = [
  'topic.start',
  'topic.start.data',
  'topic.start.screen',
  'topic.start.signIn',
  'topic.start.dev',
]

/** The names of every page of the docs, each without its ending, in their order. */
export const pageNames = (): string[] => list.map((one) => one.name)

/**
 * Takes what a page is asked for by: its whole name, as `word.text`, or the name of its thing alone, as `text`,
 * `T1003` or `query.rows`. Answers the page with its name and its text, or nothing where no page fits. A bare name
 * that several kinds hold is the page of the first kind among a code, a command, a word and a topic.
 */
export function findPage(asked: string): { name: string; text: string } | undefined {
  const names = [asked, ...kinds.map((kind) => `${kind}.${asked}`)]
  const found = names.map((name) => list.find((one) => one.name === name)).find((one) => one !== undefined)
  return found ? { name: found.name, text: textOf(`./pages/${found.file}`) } : undefined
}

/** The text of `AGENTS.md`, the short index that is written into a new project for every coding agent to read first. */
export const agentsText = (): string => textOf('./AGENTS.md')

/**
 * The reference: every word with its options, every hook, every tag with its properties, every command with its
 * flags, and every code, each on its line, as `npm run lists` made it from the types and the lists. It lies in the
 * package as `reference.txt`, beside the pages, so a coding agent reads it with no command.
 */
export const referenceText = (): string => textOf('./reference.txt')

// Where the docs site serves the pages, each at its name, and the reference beside them.
const site = 'https://tentjs.com/docs'

/**
 * The text of `llms.txt` of the docs site, for an AI that reads the site with no project: the text of `AGENTS.md`,
 * with the address of the reference and of the pages in place of the commands that print them on a builder's own
 * computer. `site` is the address the docs are served at.
 */
export function llmsText(o: { site?: string } = {}): string {
  const at = o.site ?? site
  return agentsText()
    .split('\n')
    .map((line) =>
      line
        .replaceAll('`tent docs --reference`', `${at}/reference.txt`)
        .replaceAll('`tent docs`', at)
        .replace(/`tent docs <([^>]+)>`/g, `${at}/<$1>`)
        .replace(/`tent docs ([^`<]+)`/g, (_, name: string) => `${at}/${name}`),
    )
    .join('\n')
}
