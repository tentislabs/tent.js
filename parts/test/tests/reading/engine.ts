import type { Makers } from 'tentjs/engine'
import { scanned } from './lib/scan.ts'

// A reader of the builder's own, for a kind that ours do not know and for every picture: it is made with a
// secret of the app, which a maker opens.
export default {
  textReaders: ({ secrets }) => [
    {
      kinds: ['application/x-scan', 'image/*'],
      read: async (bytes, info) => scanned(bytes, info, secrets.SCAN_KEY.reveal()),
    },
  ],
} satisfies Makers
