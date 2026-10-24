import { existsSync } from 'node:fs'

// Loaded with `--import` into a program that a test starts through a launcher, which no word of the test reaches: the
// file that `TENT_TEST_END` names stands for Ctrl+C, and once it is there the program ends as it does for the signal.
const flag = process.env.TENT_TEST_END
if (flag) {
  const looking = setInterval(() => {
    if (!existsSync(flag)) return
    clearInterval(looking)
    process.emit('SIGTERM')
  }, 20)
  looking.unref()
}
