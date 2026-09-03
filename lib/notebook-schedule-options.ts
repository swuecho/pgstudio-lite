/** Interval choices offered by the UI, in minutes. The API accepts exactly these. */
export const NOTEBOOK_SCHEDULE_INTERVALS_MINUTES = [5, 15, 30, 60, 180, 360, 720, 1440] as const

export type NotebookScheduleIntervalMinutes = (typeof NOTEBOOK_SCHEDULE_INTERVALS_MINUTES)[number]

export function isAllowedScheduleInterval(minutes: number): minutes is NotebookScheduleIntervalMinutes {
  return (NOTEBOOK_SCHEDULE_INTERVALS_MINUTES as readonly number[]).includes(minutes)
}

export function formatScheduleInterval(minutes: number) {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'every day' : `every ${minutes / 1440} days`
  if (minutes % 60 === 0) return minutes === 60 ? 'every hour' : `every ${minutes / 60} hours`
  return `every ${minutes} min`
}
