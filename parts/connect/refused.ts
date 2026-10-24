import { TentError } from '../core/index.ts'

/** The rule that an address was refused by. */
export type Rule = 'secure' | 'private' | 'password' | 'redirects' | 'body'

const said: Record<Rule, [why: string, fix: string]> = {
  secure: [
    'it is reached without a secure connection',
    'Write the address with https://. An address of the project that is reached without one is listed in `privateHosts` with http:// in front.',
  ],
  private: [
    'it is an address of this computer or of a private network',
    'List the host in `privateHosts` of the project, where the app may reach it.',
  ],
  password: [
    'it holds a user name or a password',
    'Take the name and the password out of the address, and send a sign-in in a header.',
  ],
  redirects: [
    'it is one redirect more than is followed',
    'Ask the address that the redirects lead to, or have fewer of them.',
  ],
  body: [
    'a redirect would send the body of the request on to it, which is another host',
    'Ask the address that the redirect leads to, or state that the body may travel where the fetch is made.',
  ],
}

/**
 * Takes an address as it is shown, with no name, no password and nothing after a question mark, and the rule that
 * refused it. Answers the error T0022, which names both, in its message and in its `fields`.
 */
export function refusedAddress(address: string, rule: Rule): TentError {
  const [why, fix] = said[rule]
  return new TentError('T0022', `The address ${address} was refused: ${why}.`, { fix, fields: { address, rule } })
}

/**
 * Takes an address as it is shown, which of its two caps an answer passed, and the cap, in bytes or in
 * milliseconds. Answers the error T0023.
 */
export function cutOff(address: string, cap: 'size' | 'time', bound: number): TentError {
  const passed = cap === 'size' ? `its size of ${bound} bytes` : `its time of ${bound} milliseconds`
  return new TentError('T0023', `The answer of ${address} passed ${passed}, and was cut off.`, {
    fix: 'Ask for less, or state a larger size or a longer time where the answer is known to need it.',
    fields: { address, cap },
  })
}
