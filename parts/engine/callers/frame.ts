import type { Caller } from '../../core/index.ts'
import { framePassIn, passedCaller, passLets } from '../mcp/framePass.ts'
import type { Opened } from '../opened.ts'

/**
 * The way of telling who calls that is the pass of a frame of a chat app: asked after the token of a program. The
 * caller is the one it was made for, as it is now - the token or the key narrowed by what it was given - and only
 * at what the screen's last answer named: its queries, its files, an upload and the live connection. Anywhere else,
 * and for a token, a key or a user that is gone, nobody.
 */
export const caller = {
  order: 5.5,
  find(request: Request, app: Opened): Caller | undefined {
    const pass = framePassIn(app, request)
    return pass && passLets(pass, request) ? passedCaller(app, pass) : undefined
  },
}
