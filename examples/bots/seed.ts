import { passwords, seed } from 'tentjs'

// One person, the owner of the computer, with the chief, a Calendar bot, and three apps ready to switch on.
export default seed(async ({ db }) => {
  const sam = db.users.add({
    email: 'sam@example.com',
    name: 'Sam',
    password: await passwords.hash('a long secret'),
    roles: [],
  })
  db.preferences.add({ owner: sam.id })
  db.bots.add({
    name: 'Chief',
    kind: 'chief',
    model: 'quick',
    shape: 'star',
    colour: 'amber',
    brief: 'Routes what I ask to the bot whose brief fits, and tells me when it needs me.',
    owner: sam.id,
  })
  db.bots.add({
    name: 'Calendar',
    shape: 'square',
    colour: 'blue',
    brief: 'Books my calls and meetings, finds free times, and sends the invitations.',
    owner: sam.id,
  })
  db.apps.add({
    name: 'Files',
    about: 'Reads and writes the files of a folder you name',
    icon: 'files',
    command: 'npx -y @modelcontextprotocol/server-filesystem .',
    owner: sam.id,
  })
  db.apps.add({
    name: 'Browser',
    about: 'Opens pages and works in them, through Playwright',
    icon: 'browser',
    command: 'npx -y @playwright/mcp@latest',
    owner: sam.id,
  })
  db.apps.add({
    name: 'Calendar',
    about: 'Your calendar, at the address of its MCP server',
    icon: 'calendar',
    address: 'http://127.0.0.1:7812/mcp',
    owner: sam.id,
  })
})
