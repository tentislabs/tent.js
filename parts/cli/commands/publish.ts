import { join, resolve } from 'node:path'
import { boolean, text } from '../../core/index.ts'
import { openHistory } from '../../history/index.ts'
import type { Published } from '../../publish/index.ts'
import { publish } from '../../publish/index.ts'
import type { Command } from '../command.ts'
import { impactShown } from '../impactShown.ts'
import { withText } from '../print.ts'
import { serverFetch, targetOf } from '../targets.ts'

/** What a release that goes is asked with: how it stands, or widened. `--back` takes one back on the server. */
function releaseOf(args: Record<string, unknown>): { release?: 'status' | 'widen' | 'back' } {
  if (args.status === true) return { release: 'status' }
  if (args.widen === true) return { release: 'widen' }
  return {}
}

/** What a publish prints: the version, and the impact of the change, its one report, which holds what it would do. */
function linesOf(answer: Published & { published: boolean; to: string }, impact: string): string {
  const lines = [
    `${answer.published ? 'Published' : 'Would publish'} ${answer.version} to ${answer.to}${answer.hard ? ', a hard switch' : ''}${answer.opens ? ', which opens the app again' : ''}.`,
    ...(impact ? [impact] : []),
  ]
  const { release } = answer
  if (release)
    lines.push(
      `The release of ${release.to} ${release.state === 'back' ? `was taken back: ${release.why ?? ''}` : release.state === 'done' ? 'reached every visitor' : `goes: step ${release.step + 1} of ${release.steps.length}, ${Math.round(release.share * 100)}% of the callers`}.`,
    )
  if (answer.refused) lines.push(`Refused: ${answer.refused}`)
  const asks = answer.impact && (answer.impact.rights.length || answer.impact.breaks.length)
  if (!answer.published && !answer.refused && !release)
    lines.push(`Nothing was published: type --yes${asks ? ' --accept-impact' : ''} to publish to ${answer.to}.`)
  return lines.join('\n')
}

/**
 * Publishes the files of a point to a server: the point is built for release and checked, what the server lacks
 * is sent, and the server is asked what the publish would do. Without `--yes` that is printed and nothing is
 * published; with it the server checks, adds the version beside the running one, asks its health query, and
 * switches. The impact of the change is printed before, and one that widens rights or breaks callers outside lands
 * only with `--accept-impact` beside `--yes`. `--back` goes back to the version before. `--preview` runs the
 * branch that `now` follows as an app of its own on the server, in the mode test, beside what is live there.
 */
export const command: Command = {
  name: 'publish',
  args: {
    to: text({ optional: true }),
    point: text({ optional: true }),
    back: boolean({ optional: true }),
    preview: boolean({ optional: true }),
    'stop-runs': boolean({ optional: true }),
    install: boolean({ optional: true }),
    move: boolean({ optional: true }),
    yes: boolean({ optional: true }),
    'accept-impact': boolean({ optional: true }),
    gradual: boolean({ optional: true }),
    status: boolean({ optional: true }),
    widen: boolean({ optional: true }),
    insecure: text({ optional: true }),
    data: text({ optional: true }),
  },
  needs: 'project',
  run: async ({ args, folder }) => {
    const target = targetOf(args.to)
    const history = openHistory(typeof args.data === 'string' ? resolve(folder, args.data) : join(folder, '.tent'))
    try {
      const answer = await publish({
        project: folder,
        history,
        to: target,
        fetch: serverFetch(args.insecure),
        ...(typeof args.point === 'string' ? { point: args.point } : {}),
        ...(args.back === true ? { back: true } : {}),
        ...(args.preview === true ? { preview: true } : {}),
        ...(args['stop-runs'] === true ? { stopRuns: true } : {}),
        ...(args.install === true ? { install: true } : {}),
        ...(args.move === true ? { move: true } : {}),
        ...(args.yes === true || args.preview === true ? {} : { try: true }),
        ...(args['accept-impact'] === true ? { acceptImpact: true } : {}),
        ...(args.gradual === true ? { gradual: true } : {}),
        ...releaseOf(args),
      })
      // A publish that the target refused published nothing, whatever was typed.
      const value = { ...answer, published: args.yes === true && answer.refused === undefined, to: target.name }
      return { value: withText(value, linesOf(value, value.impact ? await impactShown(value.impact) : '')) }
    } finally {
      history.close()
    }
  },
}
