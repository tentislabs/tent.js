/** One of the three systems the runs are carried out on, as a result file and the path of a picture name it. */
export type System = 'windows' | 'macos' | 'linux'

const names: Partial<Record<NodeJS.Platform, System>> = { win32: 'windows', darwin: 'macos', linux: 'linux' }

/**
 * Answers the name of the system this program runs on. Throws on a system that is none of the three.
 */
export function system(): System {
  const name = names[process.platform]
  if (!name) throw new Error(`the runs know Windows, macOS and Linux, and this system is ${process.platform}`)
  return name
}
