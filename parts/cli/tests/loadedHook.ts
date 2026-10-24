// Loaded first into a program that a test starts: writes the address of every module the program loads into the file
// that `TENT_LOADED` names, one on each line, as each is loaded. A module that is only looked for is not loaded.
import { appendFileSync } from 'node:fs'
import { registerHooks } from 'node:module'

const into = process.env.TENT_LOADED
registerHooks({
  load(url, context, next) {
    if (into) appendFileSync(into, `${url}\n`)
    return next(url, context)
  },
})
