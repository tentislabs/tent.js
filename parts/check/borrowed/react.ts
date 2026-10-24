import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const here = createRequire(import.meta.url)

/**
 * Answers where the type checker finds the types of React, by the names that a screen file with tags is read with:
 * a project installs no React of its own, so they are those of the framework. Nothing where they are not installed.
 */
export function reactPaths(): Record<string, string[]> {
  try {
    const folder = dirname(here.resolve('@types/react/package.json')).replaceAll('\\', '/')
    return {
      react: [`${folder}/index.d.ts`],
      'react/jsx-runtime': [`${folder}/jsx-runtime.d.ts`],
      'react/jsx-dev-runtime': [`${folder}/jsx-dev-runtime.d.ts`],
    }
  } catch {
    return {}
  }
}
