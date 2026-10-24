import { project } from 'tentjs'

// The project of the MCP door. The login of a company names a person by a header, as its proxy writes it. The
// counts of a minute stand far above the tests, and a call of an action is cut at two seconds, so that a flow
// outlasts it.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000, screensPerMinute: 100000, actionTime: '2 seconds' },
  mcp: { names: { renamedTool: 'renamed' }, on: { 'resources/list': 'listResources', 'prompts/get': 'secretPrompt' } },
  identify: async ({ request, db }) => {
    const named = request.headers.get('company-user')
    if (named === null) return undefined
    const user = await db.users.where({ email: named }).first()
    return user?.id
  },
})
