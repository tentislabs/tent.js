import { handLine, linesHanded, linesTold } from '../../threadLines.ts'

// A program of its own, which stands for one whose two threads write into its memory: the first takes the room of its
// line and is ended before it writes it; the second writes its line after it. The program tells what it holds as it ends.
const { options } = linesHanded('review', '', {})
const memory: unknown = Reflect.get(Object(options.workerData), 'lines')
if (!(memory instanceof SharedArrayBuffer)) throw new Error('no memory was handed')
Reflect.set(globalThis, Symbol.for('tent.thread.lines.review'), memory)
Atomics.add(new Int32Array(memory, 0, 1), 0, Buffer.byteLength('the first line\n'))
handLine('review', 'the second line\n')
linesTold('review', (lines) => process.stdout.write(lines))
