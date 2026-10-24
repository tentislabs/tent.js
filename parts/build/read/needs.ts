import { screenWords } from './access.ts'
import type { FileReach } from './arrows.ts'

/**
 * Takes what a screen file gives its views. Answers the parts of the page code that its views need: the part of
 * each tag, hook and value word that the file imports.
 */
export function neededBy(file: FileReach): string[] {
  const words = [...file.imports.values()].flatMap((one) => ('ours' in one ? [one.ours] : []))
  const found = new Set<string>()
  // A value word that the file takes from `tentjs/ui` is held by a part of its own.
  if (words.some((name) => screenWords.has(name))) found.add('values')
  // A file that records the microphone loads the part that records.
  if (words.includes('useMicrophone')) found.add('mic')
  // A file that follows a run loads the part that follows runs.
  if (words.includes('useAgent') || words.includes('useRun')) found.add('agent')
  // The tags `Form` and `Image` are each a part of the page code, which a file that imports one loads.
  if (words.includes('Form')) found.add('form')
  if (words.includes('Image')) found.add('image')
  return [...found].sort()
}
