import { component, Form, Link, read, text, useCall } from 'tentjs/ui'
import { appList, setBotApp } from '../functions/apps'
import { changeBot, getBot } from '../functions/bots'
import { addRoutine, removeRoutine, routineList } from '../functions/routines'
import { runList } from '../functions/runs'
import { CloseIcon } from './icons'
import { Switch } from './Settings'

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const BY: Record<string, string> = { person: 'You asked', routine: 'By a routine', chief: 'From the chief' }

/** The details of a bot at the right of its talk: its brief, its routines, its runs, and the apps it may use. */
export const Details = component('Details', {
  props: { bot: text() },
  data: ({ props }) => ({
    row: read(getBot, { id: props.bot }),
    runs: read(runList, { bot: props.bot }),
    routines: read(routineList, { bot: props.bot }),
    apps: read(appList),
  }),
  view: ({ row, runs, routines, apps }) => {
    const remove = useCall(removeRoutine)
    const allow = useCall(setBotApp)
    if (!row) return null
    return (
      <aside className="details" aria-label="Details">
        <Link to={`/bots/${row.id}`} className="x details-close" aria-label="Close details" keep>
          <CloseIcon />
        </Link>
        <section>
          <h2>Brief</h2>
          <Form
            id="brief"
            call={changeBot}
            with={{ id: row.id }}
            values={{ brief: row.brief }}
            reset={false}
            className="box form-stack"
            aria-label="Brief"
          >
            <label className="field">
              <span className="hidden-words">Brief</span>
              <textarea name="brief" placeholder={`What ${row.name} is for`} />
            </label>
            <div className="answers">
              <button type="submit" className="light">
                Save
              </button>
            </div>
          </Form>
        </section>
        <section>
          <h2>Routines</h2>
          <div className="box" id="routines">
            {(routines ?? []).length === 0 && (
              <p className="box-empty">Ask in chat to set a routine, or add one here</p>
            )}
            {(routines ?? []).map((one) => (
              <div className="box-row" key={one.id} id={`routine-${one.id}`}>
                <span className="box-words">
                  <span className="box-title">{one.task}</span>
                  <span className="box-line">
                    {one.every ?? `When ${one.on}`}
                    {one.next && ` · next ${WHEN.format(new Date(one.next))}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="remove"
                  disabled={remove.busy}
                  onClick={() => void remove.call({ id: one.id })}
                >
                  Remove
                </button>
              </div>
            ))}
            <Form id="routine" call={addRoutine} with={{ bot: row.id }} className="form-stack" aria-label="New routine">
              <label className="field">
                When
                <input name="every" placeholder="every day at 08:00" />
              </label>
              <label className="field">
                Task
                <input name="task" placeholder="Sort my inbox and tell me what needs me" />
              </label>
              <div className="answers">
                <button type="submit" className="light">
                  Add routine
                </button>
              </div>
            </Form>
          </div>
        </section>
        <section>
          <h2>Runs</h2>
          <div className="box" id="runs">
            {(runs ?? []).length === 0 && <p className="box-empty">No runs yet</p>}
            {(runs ?? []).map((run) => (
              <div className="box-row" key={run.id} id={`run-${run.run}`}>
                <span className="box-words">
                  <span className="box-title">{run.task || 'A greeting'}</span>
                  <span className="box-line">
                    {BY[run.by] ?? run.by} · {WHEN.format(new Date(run.createdAt))}
                  </span>
                </span>
                <span className={`state ${run.state}`}>{run.state}</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Apps</h2>
          <div className="box">
            {(apps ?? []).length === 0 && <p className="box-empty">No apps yet: connect one first</p>}
            {(apps ?? []).map((app) => (
              <div className="box-row" key={app.id}>
                <span className="box-words">
                  <span className="box-title">{app.name}</span>
                  <span className="box-line">{app.about}</span>
                </span>
                <Switch
                  on={row.apps.includes(app.id)}
                  label={`${row.name} may use ${app.name}`}
                  onChange={(on) => void allow.call({ bot: row.id, app: app.id, on })}
                />
              </div>
            ))}
          </div>
        </section>
      </aside>
    )
  },
})
