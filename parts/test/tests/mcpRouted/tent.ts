import { project, route } from 'tentjs'

// An app that offers nothing to MCP: the address `/mcp` is a route's like any other.
export const shop = project('shop', { title: 'Shop' })

export const atMcp = route('atMcp', {
  method: 'GET',
  path: '/mcp',
  access: 'anyone',
  run: async () => new Response('the route at /mcp'),
})
