import type { Finding } from '../../core/index.ts'
import { stateEntries } from '../../core/internal.ts'
import { definitionNamed } from '../named.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { tagsOf } from '../tags.ts'

/**
 * A use of a component that keeps state in the address, with no `id` written in place: its state is kept under the
 * `id` of the use, so two uses of it, or a use on another screen, would read one another's.
 */
export const rule: Rule = {
  code: 'T6022',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const tag of tagsOf(source)) {
      if (tag.taken !== undefined) continue
      const used = definitionNamed(source, tag.written.path, tag.name)
      const stored = used?.word === 'component' ? description.components[used.name] : undefined
      if (!stored) continue
      const kept = Object.entries(stateEntries(stored.state)).filter(([, entry]) => entry.in === 'address')
      const id = tag.props.get('id')?.literal
      if (!kept.length || (id?.known && typeof id.value === 'string')) continue
      found.push(
        at(
          'T6022',
          tag.written,
          tag.props.get('id')?.node ?? tag.node,
          `the use of \`${tag.name}\` keeps \`${kept[0][0]}\` in the address, and writes no \`id\` in place: its state is kept under the \`id\` of the use.`,
          'Write an `id` of its own on the use, as `id="filters"`.',
        ),
      )
    }
    return found
  },
}
