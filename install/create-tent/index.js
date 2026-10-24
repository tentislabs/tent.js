#!/usr/bin/env node
// `npm create tent <name>`: the one thing it does is run `tent new <name>` of the newest tentjs.
process.exitCode = (await import('node:child_process')).spawnSync(process.execPath, [process.env.npm_execpath, 'exec', '--yes', '--package', 'tentjs@latest', '--', 'tent', 'new', ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1
