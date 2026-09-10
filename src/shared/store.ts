import { compactDay, emptyDay, normalizeDays, type DayRecord } from './reports'
import {
  CUSTOM_LAYOUT_ID,
  PREVIOUS_LAYOUT_IDS,
  applyDefaultFiveTanks,
  emptyIdentity,
  isLegacyThreeTankLayout,
  prepareIdentity,
  setupTemplateStation,
  type StationConfig,
  type StationIdentity
} from './station'

export interface AppStore {
  config: StationConfig
  identity: StationIdentity
  setupCompleted: boolean
  activeDate: string
  days: Record<string, DayRecord>
  updatedAt?: string
}

export function emptyStore(activeDate: string): AppStore {
  return {
    config: setupTemplateStation(),
    identity: emptyIdentity(),
    setupCompleted: false,
    activeDate,
    days: {}
  }
}

function migrateConfig(config: StationConfig): StationConfig | null {
  if (!Array.isArray(config.fuelTypes) || !Array.isArray(config.machines)) return null
  if (config.fuelTypes.length === 0 || config.machines.length === 0) return null

  const tanks = Array.isArray(config.tanks) ? config.tanks : []
  const needsFiveTankUpgrade =
    PREVIOUS_LAYOUT_IDS.includes(config.layoutId) || isLegacyThreeTankLayout({ ...config, tanks })

  if (needsFiveTankUpgrade) {
    return applyDefaultFiveTanks({ ...config, tanks })
  }

  const next = {
    ...config,
    layoutId: config.layoutId || CUSTOM_LAYOUT_ID,
    tanks
  }
  return {
    ...next,
    machines: next.machines.map((machine) => {
      if (machine.tankId && next.tanks.some((tank) => tank.id === machine.tankId)) return machine
      const ofFuel = next.tanks.filter((tank) => tank.fuelTypeId === machine.fuelTypeId)
      if (ofFuel.length === 1) return { ...machine, tankId: ofFuel[0].id }
      return machine
    })
  }
}

function normalizeIdentity(value: unknown): StationIdentity {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return emptyIdentity()
  const record = value as Partial<StationIdentity>
  const prepared = prepareIdentity({
    operatorName: typeof record.operatorName === 'string' ? record.operatorName : '',
    stationName: typeof record.stationName === 'string' ? record.stationName : '',
    taxId: typeof record.taxId === 'string' ? record.taxId : '',
    address: typeof record.address === 'string' ? record.address : '',
    branch: typeof record.branch === 'string' ? record.branch : ''
  })
  if (!prepared.stationName && !prepared.operatorName) return emptyIdentity()
  return prepared
}

export function needsSetup(store: AppStore): boolean {
  return store.setupCompleted !== true
}

export function migrateStore(store: AppStore): AppStore {
  const config = migrateConfig(store.config)
  const days = normalizeDays(store.days as Record<string, unknown>)
  if (!config) {
    return emptyStore(store.activeDate)
  }

  const identity = normalizeIdentity(store.identity)
  const setupCompleted = store.setupCompleted === true

  return {
    ...store,
    config,
    identity,
    setupCompleted,
    days
  }
}

export function withConfig(store: AppStore, config: StationConfig): AppStore {
  return {
    ...store,
    config
  }
}

export function withIdentity(store: AppStore, identity: StationIdentity): AppStore {
  return {
    ...store,
    identity: prepareIdentity(identity)
  }
}

export function completeSetup(
  store: AppStore,
  identity: StationIdentity,
  config: StationConfig
): AppStore {
  return {
    ...store,
    identity: prepareIdentity(identity),
    config,
    setupCompleted: true
  }
}

export function withDay(store: AppStore, date: string, day: DayRecord): AppStore {
  return {
    ...store,
    activeDate: date,
    days: {
      ...store.days,
      [date]: compactDay(day)
    }
  }
}

export function dayFor(store: AppStore, date: string): DayRecord {
  return store.days[date] ?? emptyDay()
}

export function isAppStore(value: unknown): value is AppStore {
  if (value == null || typeof value !== 'object') return false
  const record = value as Partial<AppStore>
  return (
    typeof record.activeDate === 'string' &&
    record.config != null &&
    typeof record.config === 'object' &&
    Array.isArray(record.config.fuelTypes) &&
    Array.isArray(record.config.machines) &&
    record.days != null &&
    typeof record.days === 'object'
  )
}
