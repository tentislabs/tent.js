import type { Makers } from 'tentjs/engine'

// Two providers of the builder's own: one that writes, and one for a model that is a function, which hands back
// the bytes of the photo it was given as the picture it made, and says how many it was given.
export default {
  providers: () => ({
    mine: {
      async *reply(o) {
        const said = o.messages.map((one) => one.text ?? '').join(' ')
        yield { text: 'made here: ' }
        yield { end: { text: `made here: ${said}`, calls: [], units: { tokensIn: 3, tokensOut: 4 } } }
      },
    },
    pictures: {
      async call(o) {
        const input = Object(o.input)
        if (input.prompt === 'wrong') return { output: { picture: 'no file', said: 1 } }
        const photo = Object(input.photo)
        const bytes = photo.bytes instanceof Uint8Array ? [...photo.bytes] : [1, 2, 3]
        const said = `${input.prompt}: ${photo.kind ?? 'no photo'}, ${photo.name ?? ''}, ${bytes.length} bytes`
        return { output: { picture: { bytes: new Uint8Array(bytes), kind: 'image/png', name: 'made.png' }, said } }
      },
    },
  }),
} satisfies Makers
