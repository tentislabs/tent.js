import type { GuardedFetch } from '../connect/index.ts'
import type { Caller } from '../core/index.ts'
import type { Description, ToolSource } from '../core/internal.ts'

/** What a call used, by unit: `{ tokensIn: 40, tokensOut: 12 }`, or any other unit a server charges by. */
export type Units = Record<string, number>

/** Where a call is made, when it is made inside a run: the run, its step and the pass of that step. */
export interface CallAt {
  run: string
  step: string
  repeat: number
}

/** What every request to a provider holds: the record of the model, its key, the fetch, what ends it, and where it is made. */
export interface Base {
  model: Record<string, unknown>
  key?: string
  fetch: GuardedFetch
  signal: AbortSignal
  at?: CallAt
}

/** What a model that is a function answers: its output, what it used, and the provider's own record of the call. */
export interface Result {
  output: unknown
  units?: Units
  raw?: unknown
}

/** A call of a tool that a model asked for. */
export interface ToolCall {
  id: string
  tool: string
  input: unknown
}

/** One message of a conversation as a provider is handed it. */
export interface Message {
  who: 'user' | 'assistant' | 'tool'
  text?: string
  images?: { bytes: Uint8Array; kind: string }[]
  calls?: ToolCall[]
  id?: string
  result?: unknown
  error?: string
  keep?: unknown
}

/** A request for a text, a stream of one, or a typed answer. */
export interface ReplyRequest extends Base {
  instructions?: string
  messages: Message[]
  // Each tool with its input as JSON Schema.
  tools?: { name: string; about: string; input: object }[]
  // The JSON Schema of a typed answer.
  shape?: object
  // The names of the provider's own tools that this request offers, which its server runs itself.
  hosted?: string[]
}

/** The end of an answer: its whole text, the tools it asked for, a typed value it read itself, what it used. */
export interface ReplyEnd {
  text: string
  calls: ToolCall[]
  value?: unknown
  units?: Units
  raw?: unknown
  // What the provider needs handed back with the next request of the run, unchanged.
  keep?: unknown
}

/** One part of an answer as it arrives: a part of its text, a part of the reasoning the model wrote, or its end. */
export type ReplyPart = { text: string } | { reasoning: string } | { end: ReplyEnd }

/** What speaks to an AI's server: one request to one model. It has the members for what its models can do. */
export interface Provider {
  reply?(o: ReplyRequest): AsyncIterable<ReplyPart>
  size?(o: ReplyRequest): number | Promise<number>
  embed?(o: Base & { texts: string[] }): Promise<{ vectors: number[][]; units?: Units; raw?: unknown }>
  hear?(o: Base & { audio: Uint8Array; kind: string; language?: string; hint?: string }): Promise<{
    text: string
    language?: string
    seconds: number
    units?: Units
    raw?: unknown
  }>
  speak?(
    o: Base & { text: string; voice?: string; format: 'mp3' | 'wav' | 'opus'; speed?: number },
  ): Promise<{ audio: Uint8Array; units?: Units; raw?: unknown }>
  rank?(o: Base & { words: string; texts: string[] }): Promise<{ scores: number[]; units?: Units; raw?: unknown }>
  call?(o: Base & { input: unknown }): Promise<Result>
  begin?(o: Base & { input: unknown }): Promise<{ job: string }>
  check?(o: Base & { job: string }): Promise<{ wait: number } | Result>
}

/** The call a model is asked for: one of the seven fixed calls, or a model called as a function. */
export type Method = 'reply' | 'stream' | 'fill' | 'embed' | 'hear' | 'speak' | 'rank' | 'call'

/** What one try of a model call used: counted, logged, and told as `model.fellBack` where another model answered. */
export interface Used {
  name: string
  answeredBy: string
  reason?: string
  kind: string
  caller: Caller
  run?: string
  units?: Units
  // The units that the model layer counted itself, where the provider reported none.
  counted?: string[]
  raw?: unknown
  ms: number
  ok: boolean
  code?: string
  // What the provider said of a try that failed at its end, which the log keeps as an error of the model.
  message?: string
  // The bytes that the requests of the try sent and read.
  bytes?: { in: number; out: number }
}

/** What the engine hands `ai` for one app, when it opens. `ai` reaches nothing else. */
export interface AiEnv {
  description(version: string): Description
  fetch: GuardedFetch
  secret(name: string): string
  // Throws T7102 when a limit of use is reached: at once, or where work on a worker asks its writer, by the promise it answers.
  allow(o: { model: string; call: string; caller: Caller; run?: string }): Promise<void> | void
  used(o: Used): void
  // The runtime's own call, in the call context of the step it is made in.
  call(name: string, args: unknown[]): unknown
  // To whoever watches that run.
  tell(run: string, part: object): void
  files: {
    text(id: string, caller: Caller): Promise<string>
    bytes(id: string, caller: Caller): Promise<Uint8Array>
    put(bytes: Uint8Array, info: { name: string; kind: string }, o: { caller: Caller; run?: string }): Promise<string>
    info(id: string, caller: Caller): { name: string; kind: string; size: number }
  }
  // The ones made in `engine.ts`, by name: the five that ship are `ai`'s own.
  providers: Record<string, Provider>
  // The stand-in of a test for one model, by the model's name, which takes the place of its provider.
  standIn?(model: string): Provider | undefined
  sources: Record<string, ToolSource>
  now(): number
  // On the engine's clock, so a test clock moves it.
  sleep(ms: number): Promise<void>
  // What the engine keeps for the call that is being made, under its once-only key. Outside a step nothing is kept.
  kept(): unknown
  keep(value: unknown): void
  // The rule of a tool for the starter, where it reads neither the input nor a row; nothing where it does.
  may(name: string): boolean | undefined
  // The text of a sequence into its stored form, where the build tools are installed: at once, or once they are loaded.
  read?(
    text: string,
    o: { tools: string[]; fill: boolean },
  ): { body: object[] } | { why: string; line: number } | Promise<{ body: object[] } | { why: string; line: number }>
  // Once the outside MCP servers a run offers were looked at, as the user it acts for: the tools held back now.
  outside?(services: string[], user: string | undefined): Promise<string[]>
}
