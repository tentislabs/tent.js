import { tent } from '../shell.ts'

// `tent dev` as a program of its own, for a test that measures it from its start. A word of the test stands for
// Ctrl+C, which one program cannot send another on every system: the command ends as it does for the signal.
process.once('message', () => process.emit('SIGTERM'))
process.exitCode = await tent(['dev', ...process.argv.slice(2)], {
  folder: process.cwd(),
  out: (line) => console.log(line),
})
process.disconnect?.()
