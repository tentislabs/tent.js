// A program of its own that opens an app on a data folder and holds it until it is ended.
// Run: node holder.ts <bundle folder> <data folder>
import { createEngine } from '../../index.ts'

const [bundle, dataFolder] = process.argv.slice(2)
await createEngine({ port: 0 }).open(bundle, { dataFolder, mode: 'test' })
console.log('open')
