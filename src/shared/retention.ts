import type { AppStore } from './store'

/** Current month plus the two before it. */
export const KEPT_MONTHS = 3

function monthIndex(isoDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate)
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return Number(match[1]) * 12 + (month - 1)
}

export function retentionStart(today: string): string {
  const index = monthIndex(today)
  if (index == null) return `${today.slice(0, 7)}-01`
  const oldest = index - (KEPT_MONTHS - 1)
  const year = Math.floor(oldest / 12)
  const month = (oldest % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}-01`
}

export function pruneOldDays(store: AppStore, today: string): AppStore {
  const oldest = monthIndex(retentionStart(today))
  if (oldest == null) return store

  const dates = Object.keys(store.days).filter((date) => monthIndex(date) != null).sort()
  const carry = dates.filter((date) => (monthIndex(date) as number) < oldest).at(-1)
  const days: AppStore['days'] = {}
  for (const date of dates) {
    const index = monthIndex(date) as number
    if (index >= oldest || date === carry) days[date] = store.days[date]
  }

  if (Object.keys(days).length === Object.keys(store.days).length) return store
  return { ...store, days }
}
