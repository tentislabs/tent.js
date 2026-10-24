import { sourceAt } from '../media.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { tagsOf } from '../tags.ts'

/**
 * An `Image` whose `src`, written in place, is no asset, and that states neither `width` nor `height`: the size of
 * an asset is taken from its file. A warning.
 */
export const rule: Rule = {
  code: 'T6025',
  needs: ['source'],
  run: ({ source }) =>
    tagsOf(source).flatMap((tag) => {
      if (tag.taken !== 'Image') return []
      const picture = sourceAt(tag, 'src')
      if ((picture && 'asset' in picture) || tag.props.has('width') || tag.props.has('height')) return []
      return [
        at(
          'T6025',
          tag.written,
          tag.node,
          'the size of this `Image` is neither written nor known from its file: the page jumps when it arrives.',
          'Write its `width` or its `height`, or give it an asset, whose file says its size.',
          'warning',
        ),
      ]
    }),
}
