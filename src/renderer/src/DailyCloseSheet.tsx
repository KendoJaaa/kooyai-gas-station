import type { JSX, ReactNode } from 'react'
import { Paper, SimpleGrid, Stack, Table, Text, TextInput, Title, type TextInputProps } from '@mantine/core'
import { khorSheets, korSheets, meterHistory, priceForFuel, type DayRecord } from '../../shared/reports'
import {
  fuelById,
  grandTotal,
  litersSold,
  machineInUse,
  machinesForDailyEntry,
  machinesForTank,
  nozzleListLabel,
  sortedFuelTypes,
  startMeterFor,
  type StationConfig
} from '../../shared/station'
import { formatBaht, formatMeter, parseMeter } from './kor-form/numbers'
import { entryInputProps } from './entryKeys'

function EntryInput(props: TextInputProps): JSX.Element {
  return <TextInput {...props} {...entryInputProps} />
}

export function DailyCloseSheet({
  config,
  date,
  days,
  day,
  meterDrafts,
  priceDrafts,
  stickDrafts,
  startDrafts,
  fieldErrors,
  onMeterChange,
  onPriceChange,
  onStickChange,
  onStartChange,
  extras
}: {
  config: StationConfig
  date: string
  days: Record<string, DayRecord>
  day: DayRecord
  meterDrafts: Record<string, string>
  priceDrafts: Record<string, string>
  stickDrafts: Record<string, string>
  startDrafts: Record<string, string>
  fieldErrors: Record<string, string>
  onMeterChange: (machineId: string, text: string) => void
  onPriceChange: (fuelTypeId: string, text: string) => void
  onStickChange: (tankId: string, text: string) => void
  onStartChange: (tankId: string, text: string) => void
  extras?: ReactNode
}): JSX.Element {
  const history = meterHistory(days)
  const machines = machinesForDailyEntry(config, date, history, day.meters)
  const fuelIds = new Set(machines.map((machine) => machine.fuelTypeId))
  const fuels = sortedFuelTypes(config).filter((fuel) => fuelIds.has(fuel.id))
  const tanks = khorSheets(config, date, days, day)
  const total = grandTotal(korSheets(config, date, days, day).map((sheet) => sheet.gross))

  const rows = machines.map((machine) => {
    const fuel = fuelById(config, machine.fuelTypeId)
    const start = startMeterFor(machine, date, history)
    const parsed = parseMeter(meterDrafts[machine.id] ?? '')
    const end = parsed ?? day.meters[machine.id]
    const liters = start != null && typeof end === 'number' ? litersSold(start, end) : null
    return { machine, fuel, start, end, liters }
  })

  return (
    <Stack gap="lg" data-entry-group>
      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="xs">
          มิเตอร์เช้านี้ — ตามเลขหัวจ่าย
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          กรอกเลขมิเตอร์ตอนเช้านี้ เป็นปลายงวดของเมื่อวาน และจะไปเป็นต้นงวดของวันนี้ กด Enter หรือลูกศรขึ้นลงไปหัวถัดไปตามลำดับ 1, 2, 3…
        </Text>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={90}>หัวจ่าย</Table.Th>
              <Table.Th>น้ำมัน</Table.Th>
              <Table.Th ta="right">เริ่มต้น</Table.Th>
              <Table.Th>สิ้นสุด</Table.Th>
              <Table.Th ta="right">ขายเมื่อวาน (ลิตร)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map(({ machine, fuel, start, end, liters }) => (
              <Table.Tr key={machine.id}>
                <Table.Td fw={700}>
                  {machine.nozzleNo}
                  {!machineInUse(machine) ? <Text size="xs" c="dimmed">หยุดใช้แล้ว</Text> : null}
                </Table.Td>
                <Table.Td>{fuel?.nameTh ?? ''}</Table.Td>
                <Table.Td ta="right">{formatMeter(start)}</Table.Td>
                <Table.Td>
                  {machineInUse(machine) ? <EntryInput
                    size="lg"
                    inputMode="decimal"
                    value={meterDrafts[machine.id] ?? ''}
                    error={fieldErrors[`meter:${machine.id}`] ? true : undefined}
                    aria-label={`มิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo}`}
                    onChange={(event) => onMeterChange(machine.id, event.target.value)}
                  /> : <Text>{formatMeter(end)}</Text>}
                </Table.Td>
                <Table.Td ta="right">{formatMeter(liters)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="xs">
          ราคาน้ำมันเมื่อวาน
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          ดึงจากวันก่อนหน้า เปลี่ยนเฉพาะวันที่ราคาขยับ
        </Text>
        <SimpleGrid cols={{ base: 1, sm: fuels.length }} spacing="md">
          {fuels.map((fuel) => {
            const price = priceForFuel(fuel, date, days, day)
            return (
              <EntryInput
                key={fuel.id}
                size="lg"
                label={fuel.nameTh}
                inputMode="decimal"
                rightSection={<Text size="sm">บาท</Text>}
                value={priceDrafts[fuel.id] ?? (price ? String(price) : '')}
                error={fieldErrors[`price:${fuel.id}`] ? true : undefined}
                aria-label={`ราคาน้ำมัน ${fuel.nameTh}`}
                onChange={(event) => onPriceChange(fuel.id, event.target.value)}
              />
            )
          })}
        </SimpleGrid>
      </Paper>

      {extras}

      <Text size="sm" c="dimmed">
        ผลต่างสะสมคำนวณอัตโนมัติ และเริ่มใหม่ที่ 0 ทุกต้นเดือน
      </Text>

      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="xs">
          ปริมาณน้ำมันในถัง
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          กรอกไม้วัดตอนเช้านี้ เป็นวัดปลายงวดของเมื่อวาน และจะไปเป็นต้นงวดของวันนี้
          กรอกทดสอบและยอดรับด้านบนก่อน ถ้ามี บัญชีปลายงวด = ต้นงวด + ยอดรับ − ยอดขายมิเตอร์ + หักทดสอบ
          ผลต่าง = วัดปลายงวด − บัญชี
          ต้นงวดกรอกเฉพาะวันแรกที่ยังไม่มียอดก่อนหน้า
        </Text>
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ถัง</Table.Th>
              <Table.Th>น้ำมัน</Table.Th>
              <Table.Th>หัวจ่าย</Table.Th>
              {tanks.some((sheet) => sheet.startEditable) ? <Table.Th>ต้นงวด (ลิตร)</Table.Th> : null}
              <Table.Th>หักทดสอบ (ลิตร)</Table.Th>
              <Table.Th>วัดปลายงวด (ลิตร)</Table.Th>
              <Table.Th>บัญชีปลายงวด (ลิตร)</Table.Th>
              <Table.Th>ผลต่างวันนี้ (ลิตร)</Table.Th>
              <Table.Th>ผลต่างสะสมยกไป (ลิตร)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tanks.map((sheet) => (
              <Table.Tr key={sheet.tank.id}>
                <Table.Td fw={700}>ถังที่ {sheet.tank.tankNo}</Table.Td>
                <Table.Td>{sheet.fuel.nameTh}</Table.Td>
                <Table.Td>{nozzleListLabel(machinesForTank(config, sheet.tank))}</Table.Td>
                {tanks.some((item) => item.startEditable) ? (
                  <Table.Td>
                    {sheet.startEditable ? (
                      <EntryInput
                        size="lg"
                        inputMode="decimal"
                        value={
                          startDrafts[sheet.tank.id] ??
                          (sheet.actualStart == null ? '' : String(sheet.actualStart))
                        }
                        error={fieldErrors[`start:${sheet.tank.id}`] ? true : undefined}
                        aria-label={`ปริมาณน้ำมันต้นงวด ถังที่ ${sheet.tank.tankNo}`}
                        onChange={(event) => onStartChange(sheet.tank.id, event.target.value)}
                      />
                    ) : (
                      formatMeter(sheet.actualStart)
                    )}
                  </Table.Td>
                ) : null}
                <Table.Td>{sheet.testLiters ? formatMeter(sheet.testLiters) : '—'}</Table.Td>
                <Table.Td>
                  <EntryInput
                    size="lg"
                    inputMode="decimal"
                    value={stickDrafts[sheet.tank.id] ?? ''}
                    error={fieldErrors[`stick:${sheet.tank.id}`] ? true : undefined}
                    aria-label={`ปริมาณน้ำมันวัดปลายงวด ถังที่ ${sheet.tank.tankNo}`}
                    onChange={(event) => onStickChange(sheet.tank.id, event.target.value)}
                  />
                </Table.Td>
                <Table.Td>{formatMeter(sheet.book)}</Table.Td>
                <Table.Td>{formatMeter(sheet.variance)}</Table.Td>
                <Table.Td>{formatMeter(sheet.varianceCarry)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      <Paper withBorder p="md" radius="md" bg="teal.0">
        <Text fw={700} size="lg">
          เมื่อวานขาย {formatMeter(total.liters)} ลิตร รวม {formatBaht(total.baht)} บาท
        </Text>
        <Text size="sm" c="dimmed">
          ยอดรวมก่อนหักทดสอบ น้ำมันใช้เอง และส่วนลด ดูตัวเลขนี้ก่อนบันทึก ถ้าผิดปกติมาก ให้กลับไปแก้มิเตอร์
        </Text>
      </Paper>
    </Stack>
  )
}
