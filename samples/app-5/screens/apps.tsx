import { component, Form, Link, read, screen, text, useCall } from 'tentjs/ui'
import { AppMark } from '../components/AppMark'
import { Frame } from '../components/Frame'
import { addApp, appList, dropApp } from '../functions/apps'
import { botList } from '../functions/bots'
import { removeSkill, saveSkill, skillList } from '../functions/skills'

function Tabs() {
  return (
    <nav className="tabs" aria-label="Connect apps">
      <Link to="/apps" exact keep>
        Apps
      </Link>
      <Link to="/apps/skills" keep>
        Skills
      </Link>
    </nav>
  )
}

export const appsScreen = screen('appsScreen', {
  path: '/apps',
  title: 'Connect apps',
  access: 'signedIn',
  layout: Frame,
  data: { apps: read(appList) },
  view: ({ apps }) => {
    const remove = useCall(dropApp)
    return (
      <main className="chat">
        <div className="page">
          <div className="page-inner">
            <h1>Connect apps</h1>
            <p className="page-lead">
              Each app is an MCP server that Claude Code starts by its command or reaches at its address. Switch it on
              for a bot in the details of that bot.
            </p>
            <Tabs />
            <ul className="app-grid">
              {apps.map((app) => (
                <li key={app.id} className="app-tile" id={`app-${app.id}`}>
                  <div className="app-tile-top">
                    <span className="app-icon">
                      <AppMark kind={app.icon} size={24} />
                    </span>
                    <span className="app-name">{app.name}</span>
                  </div>
                  <p>{app.about}</p>
                  <code>{app.command ?? app.address}</code>
                  <div className="answers">
                    <button
                      type="button"
                      className="remove"
                      disabled={remove.busy}
                      onClick={() => void remove.call({ id: app.id })}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <h2 className="section-head">Add an app</h2>
            <Form id="app" call={addApp} className="box form-stack" aria-label="Add an app">
              <label className="field">
                Name
                <input name="name" placeholder="Notes" />
              </label>
              <label className="field">
                What it does
                <input name="about" placeholder="Reads and writes my notes" />
              </label>
              <label className="field">
                Command
                <input name="command" placeholder="npx -y my-mcp-server" />
              </label>
              <label className="field">
                Or its address
                <input name="address" placeholder="http://127.0.0.1:7000/mcp" />
              </label>
              <div className="answers">
                <button type="submit" className="light">
                  Add
                </button>
              </div>
            </Form>
          </div>
        </div>
      </main>
    )
  },
})

/** The skills of one bot, with the form that adds one or changes the one of the same name. */
export const BotSkills = component('BotSkills', {
  props: { bot: text(), name: text() },
  data: ({ props }) => ({ skills: read(skillList, { bot: props.bot }) }),
  view: ({ bot, name, skills }) => {
    const remove = useCall(removeSkill)
    return (
      <>
        <div className="box">
          {(skills ?? []).length === 0 && <p className="box-empty">{name} has no skills yet</p>}
          {(skills ?? []).map((skill) => (
            <div className="box-row skill" key={skill.id}>
              <span className="box-words">
                <span className="box-title">{skill.name}</span>
                <span className="box-line">{skill.about}</span>
              </span>
              <button
                type="button"
                className="remove"
                disabled={remove.busy}
                onClick={() => void remove.call({ id: skill.id })}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <h2 className="section-head">A skill of {name}</h2>
        <Form id="skill" call={saveSkill} with={{ bot }} className="box form-stack skill" aria-label="Skill">
          <label className="field">
            Name
            <input name="name" placeholder="weekly-report" />
          </label>
          <label className="field">
            When to use it
            <input name="about" placeholder="When I ask for the weekly report" />
          </label>
          <label className="field">
            Its steps
            <textarea name="body" placeholder="1. Read the sales sheet..." />
          </label>
          <div className="answers">
            <button type="submit" className="light">
              Save skill
            </button>
          </div>
        </Form>
      </>
    )
  },
})

export const skillsScreen = screen('skillsScreen', {
  path: '/apps/skills',
  title: 'Skills',
  access: 'signedIn',
  layout: Frame,
  state: { bot: { type: text({ optional: true, max: 40 }), in: 'address' } },
  data: { bots: read(botList) },
  view: ({ bots, state }) => {
    const mine = bots.filter((one) => one.kind === 'bot')
    const picked = mine.find((one) => one.id === state.bot) ?? mine[0]
    return (
      <main className="chat">
        <div className="page">
          <div className="page-inner">
            <h1>Connect apps</h1>
            <p className="page-lead">
              A skill is a Claude Code skill file in the bot's own folder: when to use it, and the steps it follows.
            </p>
            <Tabs />
            <nav className="tabs" aria-label="Bots">
              {mine.map((one) => (
                <Link key={one.id} to="/apps/skills" with={{ bot: one.id }} keep>
                  {one.name}
                </Link>
              ))}
            </nav>
            {picked && <BotSkills bot={picked.id} name={picked.name} />}
          </div>
        </div>
      </main>
    )
  },
})
