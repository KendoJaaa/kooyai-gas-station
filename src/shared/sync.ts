import { emptyDay, type DayRecord } from './reports'
import { migrateStore, type AppStore } from './store'

function stamp(value: string | undefined): string {
  return value ?? ''
}

function newerDay(local: DayRecord, remote: DayRecord): DayRecord {
  return stamp(remote.savedAt) > stamp(local.savedAt) ? remote : local
}

export function mergeStores(local: AppStore, remote: AppStore): AppStore {
  const dates = new Set([...Object.keys(local.days), ...Object.keys(remote.days)])
  const days: Record<string, DayRecord> = {}
  for (const date of dates) {
    const left = local.days[date]
    const right = remote.days[date]
    if (!left) days[date] = right ?? emptyDay()
    else if (!right) days[date] = left
    else days[date] = newerDay(left, right)
  }

  const remoteReady = remote.setupCompleted === true
  const localReady = local.setupCompleted === true
  const useRemoteMeta =
    (remoteReady && !localReady) || stamp(remote.updatedAt) > stamp(local.updatedAt)
  const base = useRemoteMeta ? remote : local
  const updatedAt =
    stamp(remote.updatedAt) > stamp(local.updatedAt) ? remote.updatedAt : local.updatedAt

  return migrateStore({
    ...base,
    days,
    activeDate: local.activeDate || remote.activeDate,
    updatedAt
  })
}

export function touchStore(store: AppStore): AppStore {
  return {
    ...store,
    updatedAt: new Date().toISOString()
  }
}
