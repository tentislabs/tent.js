import { holdPart } from '../parts.ts'
import { whenAlive } from './marks.ts'
import { hiddenToken, tokenOn, tokenTaken } from './token.ts'

// A page in a browser loads this part only for a good token, before it draws: the token is taken out of the
// address as the part is loaded. A server holds the part from its start.
if (typeof window !== 'undefined') tokenTaken()

holdPart('inspect', { on: tokenOn, fields: hiddenToken, alive: whenAlive })
