import type { JSX, ReactNode } from 'react'
import { Paper, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { khorSheets, meterHistory, priceForFuel, type DayRecord } from '../../shared/reports'
import {
  activeMachines,
  bahtSold,
  fuelById,
  fuelsWithActiveNozzles,
  litersSold,
  machinesForTank,
  nozzleListLabel,
  roundBaht,
  roundLiters,
  startMeterFor,
  type StationConfig
} from '../../shared/station'
import { formatBaht, formatMeter, parseMeter } from './kor-form/numbers'
import { periodLabel } from './kor-form/dates'

export function DailyCloseSheet({
  config,
  date,
  days,
  day,
  meterDrafts,
  priceDrafts,
  stickDrafts,
  startDrafts,
  broughtDrafts,
  fieldErrors,
  onMeterChange,
  onPriceChange,
  onStickChange,
  onStartChange,
  onBroughtChange,
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
  broughtDrafts: Record<string, string>
  fieldErrors: Record<string, string>
  onMeterChange: (machineId: string, text: string) => void
  onPriceChange: (fuelTypeId: string, text: string) => void
  onStickChange: (tankId: string, text: string) => void
  onStartChange: (tankId: string, text: string) => void
  onBroughtChange: (tankId: string, text: string) => void
  extras?: ReactNode
}): JSX.Element {
  const history = meterHistory(days)
  const machines = activeMachines(config)
  const fuels = fuelsWithActiveNozzles(config)
  const tanks = khorSheets(config, date, days, day)
  const showBroughtStart = tanks.some((sheet) => sheet.varianceBroughtEditable)
  const firstMonthDate = Object.keys(days)
    .filter((key) => key < date && key.slice(0, 7) === date.slice(0, 7))
    .sort()[0]

  let totalLiters = 0
  let totalBaht = 0
  const rows = machines.map((machine) => {
    const fuel = fuelById(config, machine.fuelTypeId)
    const start = startMeterFor(machine, date, history)
    const parsed = parseMeter(meterDrafts[machine.id] ?? '')
    const end = parsed ?? day.meters[machine.id]
    const liters = start != null && typeof end === 'number' ? litersSold(start, end) : null
    const price = fuel ? priceForFuel(fuel, date, days, day) : 0
    const baht = liters != null ? bahtSold(liters, price) : null
    if (liters != null) totalLiters = roundLiters(totalLiters + liters)
    if (baht != null) totalBaht = roundBaht(totalBaht + baht)
    return { machine, fuel, start, liters }
  })

  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Title order={4} mb="xs">
          มิเตอร์เช้านี้ — ตามเลขหัวจ่าย
        </Title>
        <Text size="sm" c="dimmed" mb="sm">
          กรอกเลขมิเตอร์ตอนเช้านี้ เป็นปลายงวดของเมื่อวาน และจะไปเป็นต้นงวดของวันนี้ กดแท็บไปหัวถัดไปตามลำดับ 1, 2, 3…
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
            {rows.map(({ machine, fuel, start, liters }) => (
              <Table.Tr key={machine.id}>
                <Table.Td fw={700}>{machine.nozzleNo}</Table.Td>
                <Table.Td>{fuel?.nameTh ?? ''}</Table.Td>
                <Table.Td ta="right">{formatMeter(start)}</Table.Td>
                <Table.Td>
                  <TextInput
                    size="lg"
                    inputMode="decimal"
                    value={meterDrafts[machine.id] ?? ''}
                    error={fieldErrors[`meter:${machine.id}`] ? true : undefined}
                    aria-label={`มิเตอร์สิ้นสุด หัวจ่าย ${machine.nozzleNo}`}
                    onChange={(event) => onMeterChange(machine.id, event.target.value)}
                  />
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
              <TextInput
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

      {showBroughtStart ? (
        <Paper withBorder p="md" radius="md" bg="yellow.0">
          <Title order={4} mb="xs">
            ผลต่างสะสมยกมา — เริ่มใช้กลางเดือน
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            เปิดรายงานส่วน ข ล่าสุดบนกระดาษ ดูแถว 9 ผลต่างสะสมปัจจุบันยกไป ของแต่ละถัง แล้วนำมาใส่ที่นี่
            เป็นแถว 8 ของวันนี้ ถ้าไม่มีหรือวันที่ 1 ของเดือน ว่างไว้ = 0
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {tanks.map((sheet) => (
              <TextInput
                key={sheet.tank.id}
                size="lg"
                label={`ถังที่ ${sheet.tank.tankNo} ${sheet.fuel.nameTh}`}
                inputMode="decimal"
                value={broughtDrafts[sheet.tank.id] ?? ''}
                error={fieldErrors[`brought:${sheet.tank.id}`] ? true : undefined}
                aria-label={`ผลต่างสะสมยกมา ถังที่ ${sheet.tank.tankNo}`}
                placeholder="0"
                onChange={(event) => onBroughtChange(sheet.tank.id, event.target.value)}
              />
            ))}
          </SimpleGrid>
        </Paper>
      ) : firstMonthDate ? (
        <Text size="sm" c="dimmed">
          ผลต่างสะสมยกมาของเดือนนี้แก้ได้ที่{periodLabel(firstMonthDate)}
        </Text>
      ) : null}

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
                      <TextInput
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
                  <TextInput
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
          เมื่อวานขาย {formatMeter(totalLiters)} ลิตร รวม {formatBaht(totalBaht)} บาท
        </Text>
        <Text size="sm" c="dimmed">
          ดูตัวเลขนี้ก่อนบันทึก ถ้าผิดปกติมาก ให้กลับไปแก้มิเตอร์
        </Text>
      </Paper>
    </Stack>
  )
}
