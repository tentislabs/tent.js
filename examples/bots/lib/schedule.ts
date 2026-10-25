// Reads a schedule in words and finds its next moment after a given one, in UTC plus the person's offset.
// It knows "every N minutes", "every N hours", "every day at 08:00", "every morning at eight", "every weekday at 9:30"
// and "every monday at 08:00"; anything else is no schedule.

const words: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  noon: 12,
  midnight: 0,
}

const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export type Schedule =
  | { kind: 'interval'; minutes: number }
  | { kind: 'daily'; hour: number; minute: number; on: 'every' | 'weekday' | number }

const clock = (
  text: string,
  part: 'morning' | 'evening' | 'afternoon' | 'night' | '',
): { hour: number; minute: number } | undefined => {
  const plain = text.trim().replace(/\s*o'?clock$/, '')
  const pm = /\s*pm$/.test(plain)
  const am = /\s*am$/.test(plain)
  const bare = plain.replace(/\s*(am|pm)$/, '')
  let hour: number | undefined
  let minute = 0
  const digits = /^(\d{1,2})(?::(\d{2}))?$/.exec(bare)
  if (digits) {
    hour = Number(digits[1])
    minute = digits[2] ? Number(digits[2]) : 0
  } else if (bare in words) hour = words[bare]
  if (hour === undefined || hour > 23 || minute > 59) return undefined
  if ((pm || part === 'evening' || part === 'afternoon' || part === 'night') && hour < 12) hour += 12
  if (am && hour === 12) hour = 0
  return { hour, minute }
}

export const readSchedule = (every: string): Schedule | undefined => {
  const text = every
    .trim()
    .toLowerCase()
    .replace(/^every\s+/, '')
  const interval = /^(\d+|an?|one)?\s*(minute|minutes|hour|hours)$/.exec(text)
  if (interval) {
    const count = interval[1] && /^\d+$/.test(interval[1]) ? Number(interval[1]) : 1
    const minutes = interval[2].startsWith('hour') ? count * 60 : count
    return minutes >= 1 ? { kind: 'interval', minutes } : undefined
  }
  const daily =
    /^(day|morning|evening|afternoon|night|weekday|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+at\s+(.+)$/.exec(
      text,
    )
  if (!daily) return undefined
  const part =
    daily[1] === 'morning' || daily[1] === 'evening' || daily[1] === 'afternoon' || daily[1] === 'night' ? daily[1] : ''
  const time = clock(daily[2], part)
  if (!time) return undefined
  const on = daily[1] === 'weekday' ? 'weekday' : days.includes(daily[1]) ? days.indexOf(daily[1]) : 'every'
  return { kind: 'daily', ...time, on }
}

// `offset` is the person's zone as minutes ahead of UTC.
export const nextAfter = (schedule: Schedule, after: Date, offset = 0): Date => {
  if (schedule.kind === 'interval') return new Date(after.getTime() + schedule.minutes * 60000)
  const local = new Date(after.getTime() + offset * 60000)
  for (let day = 0; day < 8; day++) {
    const at = new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + day, schedule.hour, schedule.minute),
    )
    const weekday = at.getUTCDay()
    const fits =
      schedule.on === 'every' || (schedule.on === 'weekday' ? weekday >= 1 && weekday <= 5 : weekday === schedule.on)
    if (fits && at.getTime() > local.getTime()) return new Date(at.getTime() - offset * 60000)
  }
  return new Date(after.getTime() + 86400000)
}

// The person's zone as minutes ahead of UTC at that moment, and UTC where it is not known.
export const zoneOffset = (zone: string | undefined, at: Date): number => {
  if (!zone) return 0
  try {
    const shown = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at)
    const part = (type: string) => Number(shown.find((one) => one.type === type)?.value)
    const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
    return Math.round((local - at.getTime()) / 60000)
  } catch {
    return 0
  }
}
