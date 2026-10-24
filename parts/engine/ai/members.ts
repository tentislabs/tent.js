import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { MemberName } from '../../core/internal.ts'
import { memberNames, memberTypes, projectZone } from '../../core/internal.ts'
import type { RunView } from '../../flows/index.ts'
import { checkedInput } from '../door/input.ts'
import { refusedBy, ruled } from '../door/rule.ts'
import { byOfCaller, startedBy } from '../flows/words.ts'
import type { Opened } from '../opened.ts'
import { memoryOf, mayOpen } from './memory.ts'
import { asksAt, workingOf } from './working.ts'
import { kept } from './scores.ts'
import { heldAnswer, questionAt } from './questions.ts'
import { runWorkingOf } from '../flows/working.ts'
import { flowRuled } from '../flows/allowed.ts'

const isMember = (name: string): name is MemberName => memberNames.some((one) => one === name)

/** A member of an agent that a name gives: `helper.approve`. */
export interface MemberOf {
  agent: string
  member: MemberName
  access: unknown
  // `working` of a flow or of an action that is a run, which states `follow`: its rule is that `follow`.
  ofRun?: true
}

/**
 * The member that a name gives, of an agent of the app that states `access`, or nothing: a name of any other
 * form, and a member of an agent that states no `access`, are no function, as for a name that is not there.
 */
export function memberOf(o: Opened, name: string): MemberOf | undefined {
  const [agent, member, more] = name.split('.')
  if (more !== undefined || member === undefined || !isMember(member)) return undefined
  const flow = Object.hasOwn(o.description.flows, agent) ? o.description.flows[agent] : undefined
  if (flow?.agent === undefined) return ranMember(o, agent, member)
  const access: unknown = flow.access ?? Reflect.get(Object(flow.agent), 'access')
  if (access === undefined) return undefined
  return { agent, member, access }
}

/**
 * The member `working` of a flow that states `follow`, and of an action that states it and is a run, by `worker`
 * or `background`: nothing else, and nothing of a definition that states no `follow`.
 */
function ranMember(o: Opened, name: string, member: MemberName): MemberOf | undefined {
  if (member !== 'working') return undefined
  const flow = Object.hasOwn(o.description.flows, name) ? o.description.flows[name] : undefined
  const fn = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  const run = flow ?? (fn && (fn.worker !== undefined || fn.background !== undefined) ? fn : undefined)
  if (run?.follow === undefined) return undefined
  return { agent: name, member, access: run.follow, ofRun: true }
}

/** Whether a name is a member that is a live query: `working` of an agent, and of a run that is followed. */
export const isLiveMember = (o: Opened, name: string): boolean => memberOf(o, name)?.member === 'working'

const notFound = (run: string): TentError =>
  new TentError('T0001', `No run ${JSON.stringify(run).slice(0, 80)} is there.`, {
    fix: 'Name a run of this agent that the caller started, or one under it.',
  })

/**
 * The run that a member names, where it is a run of this agent or a run under one - the run at the top of its
 * calls is a run of the agent - and the caller started that top run. Throws T0001 otherwise: the caller learns
 * nothing of a run that is not theirs.
 */
function theirs(o: Opened, agent: string, run: string, caller: Caller): RunView {
  const runner = o.flows?.runner
  const one = runner?.read(run)
  const top = one ? runner?.read(one.top) : undefined
  if (!one || !top || top.flow !== agent || !startedBy(top.startedBy, byOfCaller(caller))) throw notFound(run)
  return one
}

/**
 * `helper.rate`: the starter's rating of a run of this agent, kept with the run in the engine's table of
 * ratings and scores. Only the starter reaches the run, so only they rate it.
 */
function ratedBy(o: Opened, agent: string, one: RunView, input: Record<string, unknown>, caller: Caller): undefined {
  kept(o, {
    run: one.id,
    agent,
    kind: 'rating',
    score: Number(input.score),
    ...(typeof input.note === 'string' ? { note: input.note } : {}),
    by: caller,
  })
  return undefined
}

/**
 * Takes an app, a member, what it was handed, and the caller. Passes the agent's `access` and the input of
 * the member, and carries it out: `working` answers the entries of section 5 of the document of agents;
 * `approve` and `refuse` answer one ask that waits, of a run the caller may answer (T0001), at a step that waits
 * with an ask (T0002), by its pass and its ask, and `approve` a question with its answer as `data` (T0002 for one
 * that does not fit); `stop` stops a run of the caller's own, or the unfinished run of a
 * conversation for any caller who may open it (T2103). Throws T3101 for a caller the access does not let in.
 */
export function answerMember(o: Opened, member: MemberOf, given: unknown, caller: Caller): unknown {
  const name = `${member.agent}.${member.member}`
  const said = ruled(member.access, caller)
  if ('needs' in said) throw refusedBy(name, said.needs, caller)
  const zone = projectZone(o.description.project)
  const input = checkedInput(name, memberTypes[member.member].input, given, {
    now: new Date(o.clock.now()),
    zone,
    caller,
  })
  // A member passes the agent's rule as a start does, a rule made with `allow` asked on what it was handed.
  const out = member.ofRun ? undefined : flowRuled(o, member.agent, member.access, input, caller)
  if (out) throw refusedBy(name, out.needs, caller)
  const run = typeof input.run === 'string' ? input.run : undefined
  const thread = typeof input.thread === 'string' ? input.thread : undefined
  // `working` reads, and is answered on a reader from its own data.
  const reading = o.flows?.runner ?? o.runsRead
  if (member.member === 'working' && !reading) throw notFound(String(input.run ?? ''))
  if (member.member === 'working' && reading && member.ofRun) return runWorkingOf(o, reading, member.agent, caller, run)
  if (member.member === 'working' && reading)
    return workingOf(o, reading, member.agent, caller, {
      ...(thread === undefined ? {} : { thread }),
      ...(run === undefined ? {} : { run }),
    })
  const runner = o.flows?.runner
  if (!runner) throw notFound(String(input.run ?? ''))
  if (member.member === 'stop') {
    if (run !== undefined) {
      runner.stop(theirs(o, member.agent, run, caller).id)
      return undefined
    }
    if (thread === undefined)
      throw new TentError('T0002', `${name} is handed a run or a conversation.`, {
        fix: 'Hand it `{ run }` or `{ thread }`.',
      })
    // Whoever may open a conversation may steer it.
    mayOpen(o, memoryOf(o, member.agent), thread, caller)
    for (const one of runner.find({ flow: member.agent, thread, states: ['running', 'waiting'] })) runner.stop(one.id)
    return undefined
  }
  const one = theirs(o, member.agent, String(run), caller)
  const step = String(input.step)
  if (member.member === 'rate') return ratedBy(o, member.agent, one, input, caller)
  if (!asksAt(o, runner, one, step))
    throw new TentError(
      'T0002',
      `No ask waits at the step ${JSON.stringify(step).slice(0, 80)} of the run ${one.id}.`,
      {
        fix: 'Answer an ask that `working` lists, with its run, its step, its repeat and its n.',
      },
    )
  const how = {
    ...(typeof input.repeat === 'number' ? { repeat: input.repeat } : {}),
    ...(typeof input.n === 'number' ? { n: input.n } : {}),
  }
  // A question is answered by a yes whose `data` is the answer, held to the question.
  const question = questionAt(one, step, typeof input.repeat === 'number' ? input.repeat : undefined)
  if (question && member.member === 'approve') heldAnswer(question, input.data)
  if (member.member === 'approve') runner.approve(one.id, step, question ? input.data : undefined, how)
  else runner.refuse(one.id, step, undefined, how)
  return undefined
}
