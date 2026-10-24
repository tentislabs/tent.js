# `useAgent`

Starts an agent from the code of a view, and shows its run as it works: the answer as it is written, each step, and each ask that waits for the person.

## Example

```tsx
import { screen, useAgent, useParams } from 'tentjs/ui'
import { helper } from '../functions/helper'

export const chatScreen = screen('chatScreen', {
  path: '/chat/:chat',
  access: 'signedIn',
  view: () => {
    const { chat } = useParams()
    const a = useAgent(helper, { thread: String(chat) })
    return (
      <section className="chat">
        <p>{a.answer}</p>
        <button type="button" onClick={() => a.send('Which orders are open?')}>
          Ask
        </button>
        {a.asks.map((ask) => (
          <button key={`${ask.run} ${ask.step}`} type="button" onClick={() => a.approve(ask)}>
            Yes to {ask.tool}
          </button>
        ))}
      </section>
    )
  },
})
```

## Takes

`useAgent(agent, { thread, speak })`: an agent as the screen file imported it; the conversation the run belongs to, where the agent keeps one; and `speak`, which has the run speak its answer, sentence by sentence, on an agent that states `voice`.

## Returns

`{ send, run, state, answer, reasoning, steps, said, asks, approve, refuse, used, error, stop }`, of the type `AgentShown` of `tentjs/ui`.

`send(message, { files, audio })` starts a run through the door, and the page follows it over its live connection. `state` is `'idle'` before there is a run, and then `'queued'`, `'running'`, `'waiting'`, `'done'`, `'failed'` or `'stopped'`. `answer` is the text of the latest `model` step, as far as it has come, and `reasoning` its reasoning where the agent states `reasoning`. `steps`, `said` and `asks` are below. `approve(ask)` and `refuse(ask)` answer an ask. `used` is what the run used so far, with the runs it called. `error` is a failure as a caller sees it, `{ code, name, message, fields, ref }`. `stop()` stops the run, and the playing of its sounds.

`steps` holds each step of the run as `{ name, repeat, tool?, state, ms?, runs? }`: the step's name and its repeat; `tool`, the tool that a step of a tool call, `tool N.M`, calls; `state`, `'started'`, `'waiting'`, `'done'` or `'failed'`; `ms`, how long the step worked, once it ended; and `runs`, the runs it called.

`said` holds the last value that each step said, as `{ step, repeat, value }`: the work of a step says it with `say(value)`, and it is never saved (`hook.useRun`).

`asks` holds each ask that waits for the person, in the run and in the runs it called, as `{ run, step, repeat, n, tool, input, call?, sequence?, more? }`: the run and the step that wait, the step's repeat, and `n`, which ask of that step it is; `tool` and `input`, the tool call that is asked about, which for a run that another run called is the tool call of the top run; `call`, where a call inside a tool call waits for a yes (`code.T7111`), the name of that call; and for the ask of a sequence, `sequence`, the calls it lists, each `{ step, tool, input, asks, agreed? }`, with `more`, whether more may follow (`option.agent.sequence`). A question of the model is an ask whose `tool` is `question` (`option.agent.questions`). A tool asks so where it states `danger: 'ask'`, or sends data out and `trust` does not name it (`option.agent.tools`).

An agent that a driver of your own runs (`adapter.Driver`) has no `model` step of the engine's: its `answer` is what the driver tells of it, piece by piece, with `env.tell(run.id, { kind: 'text', step, text })`, and `said` what its steps say with `say`.

After a reload the hook follows its run again: with a `thread`, the caller's latest run on that conversation, which `working` names; without one, the run it kept in the session storage of the page.

Earlier messages of a conversation are no part of the hook: a screen reads them from the memory table with a live query.

**What was heard.** A run that `send` started with `audio` hears it first, in its step `hear`, and the words it heard are the person's message, after what they typed on a new line. With `memory` and a `thread`, the run writes that message into the memory table as the row `who: 'user'` before the model reads it, so the live query of the conversation shows what was heard as the person's own words (`code.T7007`).

**In a test** a faked model gives its text as one part, so `answer` holds the whole text at once; a page that shows an answer as it arrives is tested with a real model, or with a provider of the project's own whose `reply` gives the text in several parts (`adapter.Provider`), which `providers` of its `engine.ts` makes and a test app uses (`topic.tests.model`).

## See also

`hook.useMicrophone`, `word.agent`, `topic.live`
