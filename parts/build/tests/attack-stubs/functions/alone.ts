import { action, text } from 'tentjs'

// MARKER-COMMENT-OF-THE-LONE-FILE-0123456789
const lonePassword = ['MARKER-SECRET-OF-THE-LONE-FILE', '0123456789']

// A backend file that names no table: its text is code and nothing else.
export const askAlone = action('askAlone', {
  access: 'signedIn',
  input: { note: text() },
  run: async ({ input }) => [input.note, 'MARKER-RUN-OF-THE-LONE-FILE-0123456789', ...lonePassword].join(' '),
})
