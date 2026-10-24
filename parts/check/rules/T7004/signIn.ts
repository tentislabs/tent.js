import { isStored } from '../../../core/internal.ts'
import { isOfferedToMcp } from '../../offered.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'

/**
 * A project that offers to MCP something a person must be signed in for, and has no screen at its `signInPath`: a
 * chat app signs a person in there, so no chat app gets in. What a project with `mcp: { anyone: true }` offers under
 * the rule `anyone` is reached with no sign-in, and needs no screen. A warning, at the project.
 */
export const rule: Rule = {
  code: 'T7004',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const open = Object(description.project.mcp).anyone === true
    const signedIn = (one: unknown) =>
      isOfferedToMcp(one) && !(open && isStored(one) && Object(one.access).rule === 'anyone')
    const offers = [description.functions, description.flows, description.screens].some((all) =>
      Object.values(all).some(signedIn),
    )
    const path = typeof description.project.signInPath === 'string' ? description.project.signInPath : '/sign-in'
    const signs = Object.values(description.screens).some((one) => one.path === path)
    const written = writtenIn(source).find((one) => one.word === 'project')
    if (!offers || signs || !written) return []
    return [
      at(
        'T7004',
        written,
        undefined,
        `it offers functions to MCP that a person signs in for, and has no screen at its signInPath, ${path}: a chat app signs a person in there, so none gets in.`,
        'Add a screen of sign-in at that path, as `tent docs topic.signIn` writes one, or name another `signInPath`.',
        'warning',
      ),
    ]
  },
}
