import { secret, service } from 'tentjs'

// The person's own mail and calendar, each an MCP server; `tent mcp approve mailbox` and `calendar` approve their tools.
// The name `mail` is the engine's own handle, so the mail box is named `mailbox`.
export const mailbox = service('mailbox', {
  url: 'http://127.0.0.1:7811/mcp',
  mcp: true,
  auth: { bearer: secret('MAIL_KEY') },
})

export const calendar = service('calendar', {
  url: 'http://127.0.0.1:7812/mcp',
  mcp: true,
  auth: { bearer: secret('CALENDAR_KEY') },
})
