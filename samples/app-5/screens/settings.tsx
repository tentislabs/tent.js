import { Form, read, screen, useCall, useGoTo } from 'tentjs/ui'
import { TalkOf } from '../components/BotTalk'
import { Frame } from '../components/Frame'
import { CheckCircleIcon } from '../components/icons'
import { Group, Row, Settings, Switch } from '../components/Settings'
import { botList } from '../functions/bots'
import { me, signOut } from '../functions/people'
import { changePreferences, myPreferences, usedToday } from '../functions/usage'

const ZONE = new Intl.DateTimeFormat().resolvedOptions().timeZone

/** The chief's talk behind the dialog, as the window stands behind Settings. */
function Behind({ bots }: { bots: { id: string; kind: string }[] }) {
  const chief = bots.find((one) => one.kind === 'chief')
  return chief ? <TalkOf bot={chief.id} /> : null
}

export const settingsScreen = screen('settingsScreen', {
  path: '/settings',
  title: 'Settings',
  access: 'signedIn',
  layout: Frame,
  data: { bots: read(botList), person: read(me), preferences: read(myPreferences) },
  view: ({ bots, person, preferences }) => {
    const change = useCall(changePreferences)
    const out = useCall(signOut)
    const goTo = useGoTo()
    return (
      <main className="chat">
        <Behind bots={bots} />
        <Settings title="General">
          <Group heading="Account">
            <div className="box-row account">
              <span className="me big" aria-hidden="true">
                {(person?.name || person?.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="box-words">
                <span className="box-title">{person?.name}</span>
                <span className="box-line">{person?.email}</span>
              </span>
              <button
                type="button"
                className="outlined"
                disabled={out.busy}
                onClick={() => void out.call({}).then(() => goTo('/sign-in'))}
              >
                Sign Out
              </button>
            </div>
          </Group>
          <Group heading="Appearance">
            <Row title="Theme">
              <span className="menu">Dark</span>
            </Row>
            <Row title="Accent">
              <span className="menu">Bot color</span>
            </Row>
            <Row title="Language">
              <span className="menu">English</span>
            </Row>
            <Row title="Check Spelling While Typing">
              <Switch
                on={preferences?.spelling ?? true}
                label="Check Spelling While Typing"
                onChange={(on) => void change.call({ spelling: on })}
              />
            </Row>
          </Group>
          <Group heading="Bot">
            <Row title="Timezone">
              <select
                className="menu"
                aria-label="Timezone"
                value={preferences?.zone ?? ''}
                onChange={(event) => void change.call({ zone: event.target.value || undefined })}
              >
                <option value="">Auto-detect ({ZONE})</option>
                {['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Istanbul', 'America/New_York', 'Asia/Tokyo'].map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ),
                )}
              </select>
            </Row>
            <Row
              title="Auto-review"
              line="Claude Code checks each action before it runs, and asks you first when needed: each ask comes with Yes and No."
            >
              <Switch
                on={preferences?.autoReview ?? true}
                label="Auto-review"
                onChange={(on) => void change.call({ autoReview: on })}
              />
            </Row>
            <p className="box-foot">These rules apply only to you. Built-in safety checks always apply.</p>
          </Group>
        </Settings>
      </main>
    )
  },
})

const EXECUTION = { ask: 'Ask every time', always: 'Always allow', never: 'Never allow' } as const

export const computerScreen = screen('computerScreen', {
  path: '/settings/computer',
  title: 'Computer',
  access: 'signedIn',
  layout: Frame,
  data: { bots: read(botList), preferences: read(myPreferences) },
  view: ({ bots, preferences }) => {
    const change = useCall(changePreferences)
    return (
      <main className="chat">
        <Behind bots={bots} />
        <Settings title="Computer">
          <p className="inline-label">
            Your computer <b>This computer</b>
          </p>
          <Group>
            <Row
              title="Execution on this computer"
              line="Let your bots open files and run tasks in their folders. Auto-review still checks everything first."
            >
              <select
                className="menu"
                aria-label="Execution on this computer"
                value={preferences?.execution ?? 'ask'}
                onChange={(event) => {
                  const picked = Object.keys(EXECUTION).find((one) => one === event.target.value)
                  if (picked === 'ask' || picked === 'always' || picked === 'never')
                    void change.call({ execution: picked })
                }}
              >
                {Object.entries(EXECUTION).map(([value, words]) => (
                  <option key={value} value={value}>
                    {words}
                  </option>
                ))}
              </select>
            </Row>
          </Group>
          <Group heading="Bot's computer">
            <Row
              title="Each bot's own folder"
              line="Each bot works in a folder of its own under the app's data folder: its files, its skills and its Claude Code session stay there."
            />
            <p className="blue-note">
              <CheckCircleIcon /> Your bots run your own Claude Code, on your own sign-in
            </p>
          </Group>
        </Settings>
      </main>
    )
  },
})

const NUMBER = new Intl.NumberFormat('en-US')

const runsOf = (count: number) => (count === 1 ? '1 run' : `${count} runs`)

export const usedScreen = screen('usedScreen', {
  path: '/used',
  title: 'Usage',
  access: 'signedIn',
  layout: Frame,
  data: { bots: read(botList), used: read(usedToday) },
  view: ({ bots, used }) => {
    const percent = Math.round(used.share * 100)
    const names = new Map(bots.map((one) => [one.id, one.name]))
    // The use by bot arrives as JSON, a record of a bot's id and its use.
    const byBot: [string, unknown][] = Object.entries(Object(used.byBot))
    return (
      <main className="chat">
        <Behind bots={bots} />
        <Settings title="Usage & Billing">
          <div className="box usage-box" id="usage">
            <span className="box-title">Today's usage</span>
            <p className="usage-big">
              {percent}%<small>used</small>
            </p>
            <div className={used.share >= 1 ? 'bar over' : 'bar'}>
              <span className="bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="usage-row">
              <span>
                {NUMBER.format(used.tokensOut)} of {NUMBER.format(used.limit)} tokens written today
              </span>
              <span>Starts again at midnight</span>
            </p>
          </div>
          <h2>Day's limit</h2>
          <div className="box">
            <Form
              id="limit"
              call={changePreferences}
              values={{ dayLimit: used.limit }}
              reset={false}
              className="limit-form"
              aria-label="Day's limit"
            >
              <label className="field">
                Tokens a day
                <input name="dayLimit" type="number" min={0} step={1} />
              </label>
              <button type="submit" className="light">
                Save
              </button>
            </Form>
            <p className="box-foot">A bot past the limit is stopped until the day starts again.</p>
          </div>
          <h2>By bot</h2>
          <div className="box">
            {byBot.length === 0 && <p className="box-empty">No runs today</p>}
            {byBot.map(([bot, one]) => (
              <Row key={bot} title={names.get(bot) ?? 'A bot'} line={runsOf(Number(Object(one).runs ?? 0))}>
                <span className="menu">{NUMBER.format(Number(Object(one).tokensOut ?? 0))} tokens</span>
              </Row>
            ))}
          </div>
        </Settings>
      </main>
    )
  },
})
