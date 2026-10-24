import { project } from 'tentjs'

// Twenty-two functions offered to MCP, above the toolsListed of twenty that holds when none is stated.
export const shop = project('shop', {
  title: 'Shop',
  limits: { anyonePerMinute: 100000, callerPerMinute: 100000 },
  mcp: { names: {} },
})
