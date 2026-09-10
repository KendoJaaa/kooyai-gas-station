export interface FuelType {
  id: string
  code: string
  nameTh: string
  pricePerLiter: number
  sortOrder: number
}

export interface Machine {
  id: string
  fuelTypeId: string
  tankId: string
  nozzleNo: number
  row: number
  openingMeter: number
  /** false = skip this nozzle on the daily close. Default true. */
  inUse?: boolean
}

export interface Tank {
  id: string
  fuelTypeId: string
  tankNo: number
  openingStock: number
  /** Paper ส่วน ข row 9, used only the first month this app is used. */
  openingVariance?: number
}

export interface StationConfig {
  layoutId: string
  fuelTypes: FuelType[]
  machines: Machine[]
  tanks: Tank[]
}

export interface StationIdentity {
  operatorName: string
  stationName: string
  taxId: string
  address: string
  branch: string
}

/** machineId → ending meter for one calendar day */
export type DayReadings = Record<string, number>

export function litersSold(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  const delta = roundLiters(end - start)
  return delta > 0 ? delta : 0
}

export function bahtSold(liters: number, pricePerLiter: number): number {
  if (!Number.isFinite(liters) || !Number.isFinite(pricePerLiter)) return 0
  return roundBaht(liters * pricePerLiter)
}

export function roundLiters(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function roundBaht(value: number): number {
  return Math.round(value * 100) / 100
}

export function sortedFuelTypes(config: StationConfig): FuelType[] {
  return [...config.fuelTypes].sort((a, b) => a.sortOrder - b.sortOrder)
}

export function sortedMachines(config: StationConfig): Machine[] {
  return [...config.machines].sort((a, b) => a.nozzleNo - b.nozzleNo)
}

export function machineInUse(machine: Machine): boolean {
  return machine.inUse !== false
}

export function activeMachines(config: StationConfig): Machine[] {
  return sortedMachines(config).filter(machineInUse)
}

export function fuelsWithActiveNozzles(config: StationConfig): FuelType[] {
  const ids = new Set(activeMachines(config).map((machine) => machine.fuelTypeId))
  return sortedFuelTypes(config).filter((fuel) => ids.has(fuel.id))
}

/** Daily close warns if one nozzle sold more than this (likely a typo). */
export const HUGE_SALE_LITERS = 20_000

export function sortedTanks(config: StationConfig): Tank[] {
  return [...(config.tanks ?? [])].sort((a, b) => a.tankNo - b.tankNo)
}

export function machinesForTank(config: StationConfig, tank: Tank): Machine[] {
  const assigned = config.machines.filter((machine) => machine.tankId === tank.id)
  if (assigned.length > 0) {
    return [...assigned].sort((a, b) => a.nozzleNo - b.nozzleNo)
  }
  const tanksOfFuel = config.tanks.filter((item) => item.fuelTypeId === tank.fuelTypeId)
  if (tanksOfFuel.length === 1) {
    return sortedMachines(config).filter((machine) => machine.fuelTypeId === tank.fuelTypeId)
  }
  return []
}

export function nozzleListLabel(machines: Machine[]): string {
  return machines
    .map((machine) => machine.nozzleNo)
    .sort((a, b) => a - b)
    .join(', ')
}

export function fuelById(config: StationConfig, fuelTypeId: string): FuelType | undefined {
  return config.fuelTypes.find((fuel) => fuel.id === fuelTypeId)
}

export function rowCount(config: StationConfig): number {
  return config.machines.reduce((max, machine) => Math.max(max, machine.row), 0)
}

export function machineAt(
  config: StationConfig,
  fuelTypeId: string,
  row: number
): Machine | undefined {
  return config.machines.find(
    (machine) => machine.fuelTypeId === fuelTypeId && machine.row === row
  )
}

export function startMeterFor(
  machine: Machine,
  date: string,
  days: Record<string, DayReadings>
): number | null {
  const previous = Object.keys(days)
    .filter((day) => day < date)
    .sort()

  for (let index = previous.length - 1; index >= 0; index -= 1) {
    const value = days[previous[index]]?.[machine.id]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return Number.isFinite(machine.openingMeter) ? machine.openingMeter : null
}

export function unusedNozzleMeters(
  config: StationConfig,
  date: string,
  history: Record<string, DayReadings>
): DayReadings {
  const meters: DayReadings = {}
  for (const machine of config.machines) {
    if (machineInUse(machine)) continue
    const start = startMeterFor(machine, date, history)
    meters[machine.id] = start ?? machine.openingMeter ?? 0
  }
  return meters
}

export interface MachineDay {
  machine: Machine
  start: number | null
  end: number | null
  liters: number | null
  baht: number | null
}

export function machineDay(
  machine: Machine,
  date: string,
  days: Record<string, DayReadings>,
  pricePerLiter: number,
  todayReadings: DayReadings
): MachineDay {
  const start = startMeterFor(machine, date, days)
  const raw = todayReadings[machine.id]
  const end = typeof raw === 'number' && Number.isFinite(raw) ? raw : null
  if (start == null || end == null) {
    return { machine, start, end, liters: null, baht: null }
  }
  const liters = litersSold(start, end)
  return { machine, start, end, liters, baht: bahtSold(liters, pricePerLiter) }
}

export interface FuelTotals {
  liters: number
  baht: number
}

export function totalsForFuel(
  config: StationConfig,
  fuelType: FuelType,
  date: string,
  days: Record<string, DayReadings>,
  todayReadings: DayReadings
): FuelTotals {
  const rows = config.machines.filter((machine) => machine.fuelTypeId === fuelType.id)
  return rows.reduce(
    (sum, machine) => {
      const day = machineDay(machine, date, days, fuelType.pricePerLiter, todayReadings)
      if (day.liters == null || day.baht == null) return sum
      return {
        liters: roundLiters(sum.liters + day.liters),
        baht: roundBaht(sum.baht + day.baht)
      }
    },
    { liters: 0, baht: 0 }
  )
}

export function grandTotal(totals: FuelTotals[]): FuelTotals {
  return totals.reduce(
    (sum, item) => ({
      liters: roundLiters(sum.liters + item.liters),
      baht: roundBaht(sum.baht + item.baht)
    }),
    { liters: 0, baht: 0 }
  )
}

/** Default 10 หัวจ่าย: 2 Gasohol 95, 6 Diesel B7, 2 Gasohol E20. Settings may replace this. */
export const STATION_LAYOUT_ID = 'g95-b7-e20-10-v3'
export const CUSTOM_LAYOUT_ID = 'custom'
export const PREVIOUS_LAYOUT_IDS = ['g95-b7-e20-10', 'g95-b7-e20-10-v2']

export function newStationId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

export const DEFAULT_IDENTITY: StationIdentity = {
  operatorName: 'บจ ปักษ์ใต้ออยล์เทรดดิ้ง',
  stationName: 'บจ ปักษ์ใต้ออยล์เทรดดิ้ง',
  taxId: '0945537000093',
  address: '90 ม. 5 ต. รูสะมิแล อ. เมือง จ. ปัตตานี',
  branch: 'สำนักงานใหญ่'
}

const LEGACY_COMPANY_NAME = 'บจก. ปักษ์ใต้คอยล์สปริง'

export function emptyIdentity(): StationIdentity {
  return { ...DEFAULT_IDENTITY }
}

function renameLegacyCompany(name: string): string {
  return name.trim() === LEGACY_COMPANY_NAME ? DEFAULT_IDENTITY.operatorName : name.trim()
}

export function prepareIdentity(identity: StationIdentity): StationIdentity {
  return {
    operatorName: renameLegacyCompany(identity.operatorName),
    stationName: renameLegacyCompany(identity.stationName),
    taxId: identity.taxId.replace(/\D/g, ''),
    address: identity.address.trim(),
    branch: identity.branch.trim() || 'สำนักงานใหญ่'
  }
}

export function validateIdentity(identity: StationIdentity): string | null {
  const prepared = prepareIdentity(identity)
  if (!prepared.operatorName) return 'กรอกชื่อผู้ประกอบการ'
  if (!prepared.stationName) return 'กรอกชื่อสถานีน้ำมัน'
  if (!/^\d{13}$/.test(prepared.taxId)) return 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก'
  if (!prepared.address) return 'กรอกที่อยู่สถานประกอบการ'
  if (!prepared.branch) return 'กรอกสาขา'
  return null
}

export function setupTemplateStation(): StationConfig {
  return {
    ...DEFAULT_STATION,
    machines: DEFAULT_STATION.machines.map((machine) => ({ ...machine, openingMeter: 0 })),
    tanks: DEFAULT_STATION.tanks.map((tank) => ({ ...tank, openingStock: 0, openingVariance: 0 }))
  }
}

export function validateStationConfig(config: StationConfig): string | null {
  if (config.fuelTypes.length === 0) return 'ต้องมีประเภทน้ำมันอย่างน้อย 1 ชนิด'
  if (config.machines.length === 0) return 'ต้องมีหัวจ่ายอย่างน้อย 1 หัว'
  if (config.tanks.length === 0) return 'ต้องมีถังอย่างน้อย 1 ถัง'
  if (config.fuelTypes.some((fuel) => fuel.nameTh.trim() === '')) return 'กรอกชื่อประเภทน้ำมันให้ครบ'
  if (config.machines.some((machine) => machine.nozzleNo < 1)) return 'เลขหัวจ่ายต้องมากกว่า 0'
  const nozzleNos = config.machines.map((machine) => machine.nozzleNo)
  if (new Set(nozzleNos).size !== nozzleNos.length) return 'เลขหัวจ่ายซ้ำกัน'
  const tankNos = config.tanks.map((tank) => tank.tankNo)
  if (new Set(tankNos).size !== tankNos.length) return 'เลขถังซ้ำกัน'
  const fuelIds = new Set(config.fuelTypes.map((fuel) => fuel.id))
  if (config.machines.some((machine) => !fuelIds.has(machine.fuelTypeId))) {
    return 'หัวจ่ายต้องเลือกประเภทน้ำมัน'
  }
  if (config.tanks.some((tank) => !fuelIds.has(tank.fuelTypeId))) {
    return 'ถังต้องเลือกประเภทน้ำมัน'
  }
  const tankIds = new Set(config.tanks.map((tank) => tank.id))
  if (config.machines.some((machine) => !machine.tankId || !tankIds.has(machine.tankId))) {
    return 'หัวจ่ายต้องผูกกับถังน้ำมัน'
  }
  const tankFuel = new Map(config.tanks.map((tank) => [tank.id, tank.fuelTypeId]))
  if (config.machines.some((machine) => tankFuel.get(machine.tankId) !== machine.fuelTypeId)) {
    return 'หัวจ่ายกับถังต้องเป็นน้ำมันชนิดเดียวกัน'
  }
  return null
}

export function applyDefaultFiveTanks(config: StationConfig): StationConfig {
  const previousTanks = Object.fromEntries((config.tanks ?? []).map((tank) => [tank.id, tank]))
  const tankIdByNozzle = new Map(
    DEFAULT_STATION.machines.map((machine) => [machine.nozzleNo, machine.tankId])
  )
  return {
    ...config,
    layoutId: STATION_LAYOUT_ID,
    tanks: DEFAULT_STATION.tanks.map((tank) => ({
      ...tank,
      openingStock: previousTanks[tank.id]?.openingStock ?? 0,
      openingVariance: previousTanks[tank.id]?.openingVariance ?? 0
    })),
    machines: config.machines.map((machine) => ({
      ...machine,
      tankId: tankIdByNozzle.get(machine.nozzleNo) ?? machine.tankId
    }))
  }
}

export function isLegacyThreeTankLayout(config: StationConfig): boolean {
  const nozzles = config.machines.map((machine) => machine.nozzleNo).sort((a, b) => a - b)
  return nozzles.join(',') === '1,2,3,4,5,6,7,8,9,10' && (config.tanks ?? []).length <= 3
}

export function prepareStationConfig(config: StationConfig): StationConfig {
  return {
    ...config,
    layoutId: CUSTOM_LAYOUT_ID,
    fuelTypes: config.fuelTypes.map((fuel, index) => ({
      ...fuel,
      nameTh: fuel.nameTh.trim(),
      code: fuel.code.trim(),
      sortOrder: index + 1
    })),
    machines: [...config.machines]
      .sort((a, b) => a.nozzleNo - b.nozzleNo)
      .map((machine) => ({
        ...machine,
        row: machine.nozzleNo,
        inUse: machine.inUse !== false
      })),
    tanks: [...config.tanks].sort((a, b) => a.tankNo - b.tankNo)
  }
}

export const DEFAULT_STATION: StationConfig = {
  layoutId: STATION_LAYOUT_ID,
  fuelTypes: [
    {
      id: 'gasohol95',
      code: 'GASOHOL 95',
      nameTh: 'แก๊สโซฮอล์ 95',
      pricePerLiter: 42.5,
      sortOrder: 1
    },
    {
      id: 'diesel-b7',
      code: 'DIESEL B7',
      nameTh: 'ดีเซล B7',
      pricePerLiter: 32.94,
      sortOrder: 2
    },
    {
      id: 'gasohol-e20',
      code: 'GASOHOL E20',
      nameTh: 'แก๊สโซฮอล์ E20',
      pricePerLiter: 39.6,
      sortOrder: 3
    }
  ],
  machines: [
    { id: 'e20-3', fuelTypeId: 'gasohol-e20', tankId: 'tank-e20', nozzleNo: 3, row: 3, openingMeter: 33400.91 },
    { id: 'e20-4', fuelTypeId: 'gasohol-e20', tankId: 'tank-e20', nozzleNo: 4, row: 4, openingMeter: 59089.29 },
    { id: 'g95-2', fuelTypeId: 'gasohol95', tankId: 'tank-g95', nozzleNo: 2, row: 2, openingMeter: 515763.19 },
    { id: 'g95-6', fuelTypeId: 'gasohol95', tankId: 'tank-g95', nozzleNo: 6, row: 6, openingMeter: 125580.93 },
    { id: 'b7-1', fuelTypeId: 'diesel-b7', tankId: 'tank-b7', nozzleNo: 1, row: 1, openingMeter: 327927 },
    { id: 'b7-5', fuelTypeId: 'diesel-b7', tankId: 'tank-b7', nozzleNo: 5, row: 5, openingMeter: 1980343 },
    { id: 'b7-7', fuelTypeId: 'diesel-b7', tankId: 'tank-b7-78', nozzleNo: 7, row: 7, openingMeter: 0 },
    { id: 'b7-8', fuelTypeId: 'diesel-b7', tankId: 'tank-b7-78', nozzleNo: 8, row: 8, openingMeter: 0 },
    { id: 'b7-9', fuelTypeId: 'diesel-b7', tankId: 'tank-b7-910', nozzleNo: 9, row: 9, openingMeter: 0 },
    { id: 'b7-10', fuelTypeId: 'diesel-b7', tankId: 'tank-b7-910', nozzleNo: 10, row: 10, openingMeter: 0 }
  ],
  tanks: [
    { id: 'tank-e20', fuelTypeId: 'gasohol-e20', tankNo: 1, openingStock: 0, openingVariance: 0 },
    { id: 'tank-g95', fuelTypeId: 'gasohol95', tankNo: 2, openingStock: 0, openingVariance: 0 },
    { id: 'tank-b7', fuelTypeId: 'diesel-b7', tankNo: 3, openingStock: 0, openingVariance: 0 },
    { id: 'tank-b7-78', fuelTypeId: 'diesel-b7', tankNo: 4, openingStock: 0, openingVariance: 0 },
    { id: 'tank-b7-910', fuelTypeId: 'diesel-b7', tankNo: 5, openingStock: 0, openingVariance: 0 }
  ]
}
