import type { FileReach } from './arrows.ts'

/**
 * Takes what a screen file gives its views. Answers what its hooks need of the page's headers, from the hooks the
 * file imports: `{ microphone: true }` for `useMicrophone`, or nothing.
 */
export function opensBy(file: FileReach): { microphone: true } | undefined {
  const words = [...file.imports.values()].flatMap((one) => ('ours' in one ? [one.ours] : []))
  return words.includes('useMicrophone') ? { microphone: true } : undefined
}
