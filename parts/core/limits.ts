import { lengthOf, msOf, sizeOf } from './time.ts'

/** What a limit of a project bounds: how long, how many bytes, or how many. */
type Kind = 'time' | 'size' | 'count'

// Every limit of `project.limits`: what it bounds, and what holds when it is left out, in the words a project
// writes one in. A limit with no second entry has no number of its own when it is left out.
const limits: Record<string, [Kind, (string | number)?]> = {
  callSize: ['size', '1 MB'],
  uploadSize: ['size', '50 MB'],
  queryTime: ['time', '1 second'],
  changeTime: ['time', '5 seconds'],
  actionTime: ['time', '30 seconds'],
  anyonePerMinute: ['count', 60],
  callerPerMinute: ['count', 600],
  screensPerMinute: ['count', 300],
  liveRows: ['count', 10_000],
  logSize: ['size', '200 MB'],
  readTime: ['time', '30 seconds'],
  queryThreads: ['count', 2],
  fetchTime: ['time', '2 minutes'],
  looseKept: ['time', '1 hour'],
  runsKept: ['time', '30 days'],
  callDepth: ['count', 3],
  sessionTime: ['time', '30 days'],
  sessionsPerUser: ['count', 20],
  identifyKept: ['time', '15 minutes'],
  identifyPerMinute: ['count', 600],
  visitorTime: ['time', '1 year'],
  passwordMemory: ['size', '19 MB'],
  passwordPasses: ['count', 2],
  uploadsPerMinute: ['count', 30],
  filesPerMinute: ['count', 600],
  looseBytes: ['size', '500 MB'],
  looseBytesAll: ['size', '5 GB'],
  filesKept: ['time', '7 days'],
  imageCacheSize: ['size', '500 MB'],
  imagePoints: ['count', 50_000_000],
  imageTime: ['time', '10 seconds'],
  readSize: ['size', '100 MB'],
  watches: ['count', 200],
  sequenceAfter: ['count', 10],
  liveConnections: ['count', 30],
  liveMessages: ['count', 100],
  groups: ['count', 10_000],
  pageCacheSize: ['size', '64 MB'],
  pageCachePerScreen: ['count', 1000],
  prefetchAtOnce: ['count', 4],
  prefetchKept: ['time', '30 seconds'],
  loadingAfter: ['time', '200 ms'],
  optimisticKept: ['time', '2 seconds'],
  drawPasses: ['count', 5],
  streamTime: ['time', '30 seconds'],
  incomingPerMinute: ['count', 6000],
  incomingAge: ['time', '5 minutes'],
  incomingKept: ['time', '3 days'],
  connectTime: ['time', '10 minutes'],
  tokenTime: ['time', '1 hour'],
  grantTime: ['time', '30 days'],
  askTime: ['time', '10 minutes'],
  pythonPrograms: ['count', 1],
  pythonStopAfter: ['time', '10 minutes'],
  pythonLoad: ['time', '2 minutes'],
  pythonInstall: ['time', '10 minutes'],
  pythonFrameSize: ['size', '16 MB'],
  clientDocs: ['count', 500],
  registerPerMinute: ['count', 10],
  authorizeTime: ['time', '1 hour'],
  renewGrace: ['time', '10 seconds'],
  textPerSecond: ['count', 10],
  sinkSize: ['size', '64 MB'],
  beat: ['time', '1 second'],
  behind: ['time', '5 seconds'],
  dial: ['time', '30 seconds'],
  catchUp: ['time', '200 ms'],
  versionWait: ['time', '60 seconds'],
  changesKept: ['time', '10 minutes'],
  handedPerMinute: ['count', 60_000],
  openFiles: ['count', 200],
  fileCloseAfter: ['time', '1 minute'],
  filesAtOnce: ['count', 4],
  taskSize: ['size', '16 MB'],
  inFrame: ['size', '64 KB'],
  workFileSize: ['size', '2 GB'],
  workHeld: ['size', '20 GB'],
  workPerMinute: ['count', 60_000],
  workFetch: ['time', '10 minutes'],
  workDial: ['time', '30 seconds'],
  workPage: ['count', 1000],
  manyOrdered: ['count', 100_000],
  workBeat: ['time'],
  workBehind: ['time'],
  remembered: ['size', '1 GB'],
  needEvery: ['time', '10 seconds'],
  saidPerSecond: ['count', 10],
  countEvery: ['time', '1 minute'],
  levelEvery: ['time', '1 hour'],
  upkeepEvery: ['time', '1 day'],
  callerCountsKept: ['time'],
  countsKept: ['time'],
  syncFileSize: ['size', '1 GB'],
  toolsKept: ['time', '5 minutes'],
  toolsLook: ['time', '1 day'],
  clientDocSize: ['size', '64 KB'],
  clientDocKept: ['time', '1 hour'],
  originKept: ['time', '10 minutes'],
  liveWaitingSize: ['size', '1 MB'],
  queued: ['count', 10],
  sinkWait: ['time', '5 seconds'],
  clientNamesPerMinute: ['count', 10],
  signatureEntries: ['count', 20],
  codeTime: ['time', '1 minute'],
  frameAsk: ['time', '30 seconds'],
  historyKept: ['time', '30 days'],
  historyJoin: ['time', '5 seconds'],
  historyFileSize: ['size', '50 MB'],
  versionKept: ['time', '1 day'],
  versions: ['count', 5],
  syncPerMinute: ['count', 600],
  syncSize: ['size', '16 MB'],
  syncLooseSize: ['size', '1 GB'],
  publishTime: ['time', '10 minutes'],
  valueSize: ['count', 1_000_000],
  functionDepth: ['count', 100],
  archivePart: ['size', '4 MB'],
  uploadResume: ['time', '1 hour'],
  previewKept: ['time', '7 days'],
  slowSpan: ['time', '500 ms'],
  traceKeep: ['time', '7 days'],
  warmPages: ['count', 200],
  warmTime: ['time', '30 seconds'],
  seoImagesPerMinute: ['count', 30],
  callIdKeep: ['time', '1 day'],
  callHold: ['time', '2 minutes'],
  vitalsPerMinute: ['count', 60],
  testStep: ['time', '10 seconds'],
}

/** The names of the limits of a project. */
export const limitNames: string[] = Object.keys(limits)

/** What a limit of a project bounds, by its name: a time, a size or a count. Nothing for a name that is no limit. */
export const limitKind = (name: string): Kind | undefined => (Object.hasOwn(limits, name) ? limits[name][0] : undefined)

/** A limit as it is stored: a time in milliseconds, a size in bytes, and a count as it is. */
function storedLimit(words: string | number | undefined): number | undefined {
  if (typeof words !== 'string') return words
  const length = lengthOf(words)
  return length ? Math.round(length.n * msOf(length.unit)) : sizeOf(words)
}

/**
 * What each limit holds when it is left out, as it would be stored: of a project, of a flow and of an action. It is
 * the one table that `describe` leaves a default out by, and that the engine takes a limit from where none is
 * stored. A limit of a project with no number of its own when it is left out is there, with nothing.
 */
export const limitDefaults: {
  project: Record<string, number | undefined>
  flow: Record<string, number>
  action: Record<string, number>
} = {
  project: Object.fromEntries(Object.entries(limits).map(([name, [, words]]) => [name, storedLimit(words)])),
  flow: { steps: 1000, time: 2_592_000_000, result: 1_048_576, wait: 31_536_000_000, pass: 5000, stepTime: 600_000 },
  action: { runKept: 3_600_000, lost: 3 },
}
