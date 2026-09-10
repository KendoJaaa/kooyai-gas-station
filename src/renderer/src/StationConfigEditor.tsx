import { useState, type JSX } from 'react'
import { Button, Checkbox, Group, MultiSelect, Select, Table, Text, TextInput, Title } from '@mantine/core'
import {
  machineInUse,
  machinesForTank,
  newStationId,
  nozzleListLabel,
  sortedTanks,
  type FuelType,
  type Machine,
  type StationConfig,
  type Tank
} from '../../shared/station'
import { DecimalInput } from './kor-form/DecimalInput'
import { parseMeter } from './kor-form/numbers'
import './kor-form/kor-form.css'

function nextNozzleNo(machines: Machine[]): number {
  return machines.reduce((max, machine) => Math.max(max, machine.nozzleNo), 0) + 1
}

function nextTankNo(tanks: Tank[]): number {
  return tanks.reduce((max, tank) => Math.max(max, tank.tankNo), 0) + 1
}

export function StationConfigEditor({
  config,
  onChange,
  showFuels = true,
  showMachines = true,
  showTanks = true,
  simpleMode = false
}: {
  config: StationConfig
  onChange: (config: StationConfig) => void
  showFuels?: boolean
  showMachines?: boolean
  showTanks?: boolean
  simpleMode?: boolean
}): JSX.Element {
  const [layoutUnlocked, setLayoutUnlocked] = useState(!simpleMode)
  const canEditLayout = !simpleMode || layoutUnlocked
  const patchFuel = (id: string, patch: Partial<FuelType>): void => {
    onChange({
      ...config,
      fuelTypes: config.fuelTypes.map((fuel) => (fuel.id === id ? { ...fuel, ...patch } : fuel))
    })
  }

  const addFuel = (): void => {
    const id = newStationId('fuel')
    onChange({
      ...config,
      fuelTypes: [
        ...config.fuelTypes,
        {
          id,
          code: '',
          nameTh: 'น้ำมันใหม่',
          pricePerLiter: 0,
          sortOrder: config.fuelTypes.length + 1
        }
      ],
      tanks: [
        ...config.tanks,
        { id: newStationId('tank'), fuelTypeId: id, tankNo: nextTankNo(config.tanks), openingStock: 0, openingVariance: 0 }
      ]
    })
  }

  const removeFuel = (id: string): void => {
    onChange({
      ...config,
      fuelTypes: config.fuelTypes.filter((fuel) => fuel.id !== id),
      machines: config.machines.filter((machine) => machine.fuelTypeId !== id),
      tanks: config.tanks.filter((tank) => tank.fuelTypeId !== id)
    })
  }

  const patchMachine = (id: string, patch: Partial<Machine>): void => {
    onChange({
      ...config,
      machines: config.machines.map((machine) =>
        machine.id === id ? { ...machine, ...patch } : machine
      )
    })
  }

  const addMachine = (): void => {
    const fuelTypeId = config.fuelTypes[0]?.id
    if (!fuelTypeId) return
    const tankId = sortedTanks(config).find((tank) => tank.fuelTypeId === fuelTypeId)?.id
    if (!tankId) return
    const nozzleNo = nextNozzleNo(config.machines)
    onChange({
      ...config,
      machines: [
        ...config.machines,
        {
          id: newStationId('nozzle'),
          fuelTypeId,
          tankId,
          nozzleNo,
          row: nozzleNo,
          openingMeter: 0
        }
      ]
    })
  }

  const removeMachine = (id: string): void => {
    onChange({
      ...config,
      machines: config.machines.filter((machine) => machine.id !== id)
    })
  }

  const patchTank = (id: string, patch: Partial<Tank>): void => {
    onChange({
      ...config,
      tanks: config.tanks.map((tank) => (tank.id === id ? { ...tank, ...patch } : tank))
    })
  }

  const addTank = (): void => {
    const fuelTypeId = config.fuelTypes[0]?.id
    if (!fuelTypeId) return
    onChange({
      ...config,
      tanks: [
        ...config.tanks,
        {
          id: newStationId('tank'),
          fuelTypeId,
          tankNo: nextTankNo(config.tanks),
          openingStock: 0,
          openingVariance: 0
        }
      ]
    })
  }

  const removeTank = (id: string): void => {
    const fallback = sortedTanks(config).find((tank) => tank.id !== id)
    onChange({
      ...config,
      tanks: config.tanks.filter((tank) => tank.id !== id),
      machines: config.machines.map((machine) =>
        machine.tankId === id && fallback
          ? { ...machine, tankId: fallback.id, fuelTypeId: fallback.fuelTypeId }
          : machine
      )
    })
  }

  const assignNozzlesToTank = (tank: Tank, machineIds: string[]): void => {
    const allowed = new Set(machineIds)
    onChange({
      ...config,
      machines: config.machines.map((machine) => {
        if (allowed.has(machine.id)) {
          return { ...machine, tankId: tank.id, fuelTypeId: tank.fuelTypeId }
        }
        if (machine.tankId === tank.id) {
          const other = sortedTanks(config).find(
            (item) => item.id !== tank.id && item.fuelTypeId === machine.fuelTypeId
          )
          return other ? { ...machine, tankId: other.id } : machine
        }
        return machine
      })
    })
  }

  const fuelOptions = config.fuelTypes.map((fuel) => ({
    value: fuel.id,
    label: fuel.nameTh.trim() || 'ไม่มีชื่อ'
  }))

  return (
    <>
      {simpleMode && (showFuels || showMachines || showTanks) ? (
        <Group justify="flex-end" mb="xs">
          <Button variant="light" onClick={() => setLayoutUnlocked((current) => !current)}>
            {layoutUnlocked ? 'ซ่อนการแก้ผัง' : 'แก้ไขผัง'}
          </Button>
        </Group>
      ) : null}
      {showFuels ? (
        <section>
          <Group justify="space-between" mb="sm">
            <Title order={4}>ประเภทน้ำมัน</Title>
            {canEditLayout ? (
              <Button variant="light" onClick={addFuel}>
                เพิ่มประเภทน้ำมัน
              </Button>
            ) : null}
          </Group>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ชื่อ</Table.Th>
                <Table.Th>รหัส</Table.Th>
                {canEditLayout ? <Table.Th w={90} /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {config.fuelTypes.map((fuel) => (
                <Table.Tr key={fuel.id}>
                  <Table.Td>
                    <TextInput
                      value={fuel.nameTh}
                      onChange={(event) => patchFuel(fuel.id, { nameTh: event.target.value })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      value={fuel.code}
                      onChange={(event) => patchFuel(fuel.id, { code: event.target.value })}
                    />
                  </Table.Td>
                    {canEditLayout ? (
                      <Table.Td>
                        <Button color="red" variant="subtle" size="xs" onClick={() => removeFuel(fuel.id)}>
                          ลบ
                        </Button>
                      </Table.Td>
                    ) : null}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </section>
      ) : null}

      {showMachines ? (
        <section>
          <Group justify="space-between" mb="sm">
            <Title order={4}>หัวจ่าย</Title>
            {canEditLayout ? (
              <Button variant="light" onClick={addMachine} disabled={config.fuelTypes.length === 0}>
                เพิ่มหัวจ่าย
              </Button>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed" mb="sm">
            กรอกตัวเลขบนมิเตอร์ตอนนี้ ไม่ใช่ยอดขาย หัวที่ไม่ใช้ให้ติ๊ก ไม่ใช้ จะไม่ต้องกรอกทุกวัน
          </Text>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขหัวจ่าย</Table.Th>
                <Table.Th>ประเภทน้ำมัน</Table.Th>
                <Table.Th>มิเตอร์เริ่มต้น (วันแรก)</Table.Th>
                <Table.Th>ไม่ใช้</Table.Th>
                {canEditLayout ? <Table.Th w={90} /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...config.machines]
                .sort((a, b) => a.nozzleNo - b.nozzleNo)
                .map((machine) => (
                  <Table.Tr key={machine.id}>
                    <Table.Td>
                      <TextInput
                        inputMode="numeric"
                        value={String(machine.nozzleNo)}
                        onChange={(event) => {
                          const parsed = parseMeter(event.target.value)
                          if (parsed == null) return
                          patchMachine(machine.id, { nozzleNo: Math.max(1, Math.round(parsed)) })
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        data={fuelOptions}
                        value={machine.fuelTypeId}
                        onChange={(value) => {
                          if (!value) return
                          const tankId = sortedTanks(config).find((tank) => tank.fuelTypeId === value)?.id
                          patchMachine(machine.id, {
                            fuelTypeId: value,
                            ...(tankId ? { tankId } : {})
                          })
                        }}
                        allowDeselect={false}
                      />
                    </Table.Td>
                    <Table.Td>
                      <DecimalInput
                        className="kor-input extras-input"
                        value={machine.openingMeter || null}
                        onCommit={(parsed) => patchMachine(machine.id, { openingMeter: parsed ?? 0 })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Checkbox
                        aria-label={`ไม่ใช้ หัวจ่าย ${machine.nozzleNo}`}
                        checked={!machineInUse(machine)}
                        onChange={(event) =>
                          patchMachine(machine.id, { inUse: !event.currentTarget.checked })
                        }
                      />
                    </Table.Td>
                    {canEditLayout ? (
                      <Table.Td>
                        <Button
                          color="red"
                          variant="subtle"
                          size="xs"
                          onClick={() => removeMachine(machine.id)}
                        >
                          ลบ
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </section>
      ) : null}

      {showTanks ? (
        <section>
          <Group justify="space-between" mb="sm">
            <Title order={4}>ถังน้ำมัน</Title>
            {canEditLayout ? (
              <Button variant="light" onClick={addTank} disabled={config.fuelTypes.length === 0}>
                เพิ่มถัง
              </Button>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed" mb="sm">
            ส่วน ข นับเป็นถัง ดีเซลมี 3 ถัง คนละคู่หัวจ่าย ยอดยกมาคือปริมาณในถังเช้าวันแรกที่ใช้โปรแกรม
            ผลต่างสะสมยกมาใส่จากแถว 9 ของรายงานส่วน ข ล่าสุดบนกระดาษ ถ้าเริ่มวันที่ 1 หรือไม่มี ให้ว่างไว้ = 0
          </Text>
          <Table withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>เลขถัง</Table.Th>
                <Table.Th>ประเภทน้ำมัน</Table.Th>
                <Table.Th>หัวจ่าย</Table.Th>
                <Table.Th>ยอดยกมาวันแรก (ลิตร)</Table.Th>
                <Table.Th>ผลต่างสะสมยกมา (ลิตร)</Table.Th>
                {canEditLayout ? <Table.Th w={90} /> : null}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...config.tanks]
                .sort((a, b) => a.tankNo - b.tankNo)
                .map((tank) => (
                  <Table.Tr key={tank.id}>
                    <Table.Td>
                      <TextInput
                        inputMode="numeric"
                        value={String(tank.tankNo)}
                        onChange={(event) => {
                          const parsed = parseMeter(event.target.value)
                          if (parsed == null) return
                          patchTank(tank.id, { tankNo: Math.max(1, Math.round(parsed)) })
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Select
                        data={fuelOptions}
                        value={tank.fuelTypeId}
                        onChange={(value) => {
                          if (!value) return
                          const nextTanks = config.tanks.map((item) =>
                            item.id === tank.id ? { ...item, fuelTypeId: value } : item
                          )
                          onChange({
                            ...config,
                            tanks: nextTanks,
                            machines: config.machines.map((machine) => {
                              if (machine.tankId !== tank.id || machine.fuelTypeId === value) return machine
                              const other = nextTanks.find(
                                (item) => item.id !== tank.id && item.fuelTypeId === machine.fuelTypeId
                              )
                              return other ? { ...machine, tankId: other.id } : machine
                            })
                          })
                        }}
                        allowDeselect={false}
                      />
                    </Table.Td>
                    <Table.Td>
                      {canEditLayout ? (
                        <MultiSelect
                          data={config.machines
                            .filter((machine) => machine.fuelTypeId === tank.fuelTypeId)
                            .sort((a, b) => a.nozzleNo - b.nozzleNo)
                            .map((machine) => ({
                              value: machine.id,
                              label: String(machine.nozzleNo)
                            }))}
                          value={machinesForTank(config, tank).map((machine) => machine.id)}
                          onChange={(machineIds) => assignNozzlesToTank(tank, machineIds)}
                          placeholder="เลือกหัวจ่าย"
                        />
                      ) : (
                        <Text>{nozzleListLabel(machinesForTank(config, tank)) || '—'}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <DecimalInput
                        className="kor-input extras-input"
                        value={tank.openingStock || null}
                        onCommit={(parsed) => patchTank(tank.id, { openingStock: parsed ?? 0 })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <DecimalInput
                        className="kor-input extras-input"
                        value={tank.openingVariance || null}
                        onCommit={(parsed) => patchTank(tank.id, { openingVariance: parsed ?? 0 })}
                      />
                    </Table.Td>
                    {canEditLayout ? (
                      <Table.Td>
                        <Button color="red" variant="subtle" size="xs" onClick={() => removeTank(tank.id)}>
                          ลบ
                        </Button>
                      </Table.Td>
                    ) : null}
                  </Table.Tr>
                ))}
            </Table.Tbody>
          </Table>
        </section>
      ) : null}
    </>
  )
}
