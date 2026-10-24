import { child, kids, nameOf, unwrap, walk } from './tree.ts'
import type { Work } from './work.ts'

// What was found of one build, read once: the views of every screen file of it.
const found = new WeakMap<Work, Map<string, Set<string>>>()

/**
 * Takes the work of a build. Answers each asset that a view names by a text written in place, `asset('logo.png')`,
 * by the name of the view: the definition whose statement holds the call, and outside every definition its file.
 * So the page is told where each lies, and how large a picture is before it arrives.
 */
export function namedAssets(work: Work): Map<string, Set<string>> {
  const held = found.get(work)
  if (held) return held
  const named = new Map<string, Set<string>>()
  for (const file of work.files.values()) {
    if (file.sort !== 'screen' || !file.tree) continue
    const asset = new Set(
      (file.seen?.imports ?? [])
        .filter((one) => one.from === 'tentjs/ui' && one.name === 'asset')
        .map((one) => one.local),
    )
    if (!asset.size) continue
    walk(file.tree, (node) => {
      if (node.type !== 'CallExpression' || !asset.has(nameOf(unwrap(child(node, 'callee'))) ?? '')) return
      const [first] = kids(node, 'arguments')
      if (first?.type !== 'Literal' || typeof first.value !== 'string') return
      const view =
        file.seen?.declared.find((one) => one.statement.start <= node.start && node.start < one.statement.end)?.name ??
        file.path
      named.set(view, (named.get(view) ?? new Set()).add(first.value))
    })
  }
  found.set(work, named)
  return named
}
