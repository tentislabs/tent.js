import { openHistory } from '../../../history/index.ts'
import { mergedOnServer } from '../../serve/merged.ts'

// A program of the test that merges a push on a server's history by itself, and is killed by the test meanwhile.
const [folder, was, standing, pushed] = process.argv.slice(2)
const history = openHistory(folder)
await mergedOnServer(history, 'main', was, standing, pushed)
history.close()
