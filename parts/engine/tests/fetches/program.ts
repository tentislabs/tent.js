// A program of its own that fetches one part, as a second engine on the same install does: it is handed the name of
// the part, the list as JSON and the folder, and writes the folder of the part.
import { fetchPart } from '../../index.ts'

const [name = '', list = '[]', folder = ''] = process.argv.slice(2)
const place = await fetchPart(name, { list: JSON.parse(list), folder, mode: 'development' })
console.log(place)
