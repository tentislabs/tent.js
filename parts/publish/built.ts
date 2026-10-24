import type { Finding } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { finding } from '../core/internal.ts'
import type { Point } from '../history/index.ts'

/**
 * Builds the files of a point that were written into a folder of their own, for release, and holds them to the
 * check, whatever the point says of itself. Answers the description, the folder of the bundle, its version id and
 * the warnings. Throws T9101 with the errors where the build or the check finds one, and where the point left a
 * file out for its size.
 */
export async function checkedBuild(
  folder: string,
  point: Point,
): Promise<{ description: Description; bundleFolder: string; versionId: string; findings: Finding[] }> {
  const left = (point.note ?? '').split('\n').filter((line) => line.startsWith('Left out, larger than'))
  // The build and the check are loaded where a project is built, and not by a program that only runs one.
  const [{ buildProject }, { checkProject }] = await Promise.all([
    import('../build/index.ts'),
    import('../check/index.ts'),
  ])
  const built = await buildProject(folder, { for: 'release' })
  const checked = await checkProject(folder)
  const found = [
    ...built.findings,
    ...checked.findings,
    ...left.map((line) =>
      finding(
        'T9101',
        `${line}: the point left the file out for its size, \`historyFileSize\` in \`limits\` of the project.`,
        {},
      ),
    ),
  ]
  const errors = found.filter((one) => one.level === 'error')
  if (errors.length || !built.versionId)
    throw new TentError(
      'T9101',
      `The files of the point ${point.id} do not pass the check, and are not published: ${errors.map((one) => `${one.code} ${one.message}`).join(' ')}`,
      {
        fields: { point: point.id, reason: 'check', count: String(errors.length) },
        fix: 'Mend what the check finds, and publish again.',
      },
    )
  return {
    description: built.description,
    bundleFolder: built.bundleFolder,
    versionId: built.versionId,
    findings: found,
  }
}
