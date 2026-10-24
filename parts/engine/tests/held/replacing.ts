// A program that replaces the key of the secrets of the data folder it is handed, as `tent secrets key --replace`
// does: a test kills it at any moment, and starts it again.
import { replaceSecretKey } from '../../index.ts'

const [dataFolder] = process.argv.slice(2)
console.log('started')
const done = await replaceSecretKey(dataFolder)
console.log(`done ${JSON.stringify(done)}`)
