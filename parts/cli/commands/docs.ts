import { boolean, text } from '../../core/index.ts'
import { findPage, firstPages, pageNames, referenceText } from '../../docs/index.ts'
import type { Command } from '../command.ts'

/** Prints a page of the docs that are shipped with the installed version, the list of the pages, or the reference. */
export const command: Command = {
  name: 'docs',
  args: { topic: text({ optional: true }), reference: boolean({ optional: true }) },
  needs: 'nothing',
  run: async ({ args }) => {
    // The reference is printed as the file of the package holds it: the shell ends what it prints with a new line.
    if (args.reference === true) return { value: referenceText().replace(/\n$/, '') }
    const names = pageNames()
    if (typeof args.topic !== 'string') {
      // With nothing asked for: the pages that walk one app from nothing, then the topics, which lead on, and how the
      // other pages are named.
      const topics = names.filter((name) => name.startsWith('topic.')).map((name) => `tent docs ${name}`)
      const counts = ['code', 'command', 'word', 'option'].map(
        (kind) => `${names.filter((name) => name.startsWith(`${kind}.`)).length} pages \`${kind}.<name>\``,
      )
      const first = firstPages.map((name) => findPage(name)?.text.trimEnd() ?? '').join('\n\n')
      return {
        value: [
          first,
          '',
          'The docs of this version. Ask for a page by its name, or by a code:',
          ...topics,
          ...counts,
        ].join('\n'),
      }
    }
    const page = findPage(args.topic)
    if (page) return { value: page.text }
    const near = names.filter((name) =>
      name.toLowerCase().includes(args.topic === undefined ? '' : String(args.topic).toLowerCase()),
    )
    throw new Error(
      `The docs hold no page "${args.topic}".${near.length ? ` Near it: ${near.slice(0, 8).join(', ')}.` : ''}`,
    )
  },
}
