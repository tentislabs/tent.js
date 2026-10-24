import assert from 'node:assert/strict'

/** What a start answers: its run, or that the pace of its flow dropped it. */
type Started = { run: string } | { dropped: true }

/** Takes what a start answered, and fails where the start was dropped. Answers the start, whose run a test then reads. */
export function notDropped(started: Started): { run: string } {
  assert.ok('run' in started, 'the start was dropped')
  return started
}
