// Loaded before every test file: turns a `.tsx` file into JavaScript as it is loaded, so that a test imports a
// screen file as it is written, and nothing is built first.
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'rolldown/utils'

registerHooks({
  load: (url, context, next) => {
    if (!url.startsWith('file:') || !/\.tsx$/.test(url.split('?')[0])) return next(url, context)
    const file = fileURLToPath(url)
    // JSX as `tsconfig.json` states it: `react-jsx`, which imports what it needs of React by itself.
    const made = transformSync(file, readFileSync(file, 'utf8'), { jsx: { runtime: 'automatic' } })
    return { format: 'module', source: made.code, shortCircuit: true }
  },
})
