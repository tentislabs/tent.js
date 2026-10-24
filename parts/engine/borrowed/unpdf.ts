import { fetchedModule } from './fetchedModule.ts'

// The part of the borrowed API that the engine uses, typed here, since its types are not installed.
type ExtractText = (data: Uint8Array, o: { mergePages: false }) => Promise<{ totalPages: number; text: string[] }>

/**
 * Loads the reader of PDF files from the folder of its part, and answers what reads one: the text of each page, in
 * order. Throws where the part holds no reader.
 */
export async function pdfReaderIn(part: string): Promise<(bytes: Uint8Array) => Promise<string[]>> {
  const loaded: unknown = await fetchedModule(part, 'unpdf')
  const made: unknown = Reflect.get(Object(loaded), 'extractText')
  if (typeof made !== 'function') throw new Error('The part unpdf gives no reader of PDF files.')
  // The one place that names the borrowed function by the type written above.
  const extract = made as ExtractText
  return async (bytes) => {
    const { text } = await extract(new Uint8Array(bytes), { mergePages: false })
    return Array.isArray(text) ? text.map((page) => String(page ?? '')) : [String(text ?? '')]
  }
}
