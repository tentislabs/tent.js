import { existsSync, readFileSync, rmSync } from 'node:fs'
import { basename, relative, sep } from 'node:path'
import { buildProject } from '../build/index.ts'
import { checkProject } from '../check/index.ts'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { fingerprintOf } from '../core/internal.ts'
import { projectFiles } from './projectFiles.ts'

/** What the build of a workspace made: its bundle, its version, its description and what it found. */
export interface Built {
  bundleFolder: string
  versionId: string
  description: Description
  findings: Finding[]
}

/** Every file of a project by its path, with the fingerprint of its bytes, for its print: the types that the framework writes are left out. */
function filesOf(folder: string): string[] {
  if (!existsSync(folder)) return []
  return projectFiles(folder)
    .filter((place) => basename(place) !== 'tent.d.ts')
    .map((place) => `${relative(folder, place).split(sep).join('/')} ${fingerprintOf(readFileSync(place))}`)
}

/** A print of the files of a project as they stand: it differs once a file was added, removed or changed. */
export const filesPrint = (folder: string): string => fingerprintOf(filesOf(folder).join('\n'))

/** Takes the findings of a build and of a check. Answers both, with a finding that both made once. */
export const joinedFindings = (built: Finding[], checked: Finding[]): Finding[] => [
  ...built,
  ...checked.filter((one) => !built.some((was) => was.code === one.code && was.message === one.message)),
]

/**
 * Builds the project of a workspace into a folder of its own and checks it, in the program of the product, for an
 * owner the product trusts. Answers what the build made, with what the build and the check found; with an error of
 * the build among the findings, no bundle.
 */
export async function buildWorkspace(project: string, out: string, o: { for?: 'dev' | 'release' }): Promise<Built> {
  rmSync(out, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  const made = await buildProject(project, {
    for: o.for ?? 'dev',
    out,
  })
  const checked = await checkProject(project)
  return {
    bundleFolder: made.bundleFolder,
    versionId: made.versionId,
    description: made.description,
    findings: joinedFindings(made.findings, checked.findings),
  }
}
