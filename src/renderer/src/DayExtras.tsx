import type { JSX } from 'react'
import { Accordion, Button, Table, Text, TextInput } from '@mantine/core'
import {
  adjustmentsFor,
  emptyDelivery,
  type DayRecord,
  type DeliveryNote,
  type FuelAdjustments
} from '../../shared/reports'
import { sortedFuelTypes, sortedTanks, type StationConfig } from '../../shared/station'
import { entryInputProps } from './entryKeys'
import { DecimalInput } from './kor-form/DecimalInput'
import { parseMeter } from './kor-form/numbers'

export interface DayExtrasProps {
  config: StationConfig
  date: string
  day: DayRecord
  onDayChange: (next: DayRecord) => void
}

export function DayExtras({ config, date, day, onDayChange }: DayExtrasProps): JSX.Element {
  const fuels = sortedFuelTypes(config)
  const tanks = sortedTanks(config)

  const patchAdjustment = (
    fuelTypeId: string,
    field: keyof FuelAdjustments,
    text: string
  ): void => {
    const parsed = parseMeter(text) ?? 0
    const current = adjustmentsFor(day, fuelTypeId)
    onDayChange({
      ...day,
      adjustments: {
        ...day.adjustments,
        [fuelTypeId]: { ...current, [field]: parsed }
      }
    })
  }

  const addDelivery = (): void => {
    const list = day.deliveries.length > 0 ? day.deliveries : []
    onDayChange({
      ...day,
      deliveries: [...list, emptyDelivery(list.length + 1, date)]
    })
  }

  const patchDelivery = (index: number, patch: Partial<DeliveryNote>): void => {
    const list = [...day.deliveries]
    list[index] = { ...list[index], ...patch }
    onDayChange({ ...day, deliveries: list })
  }

  const patchDeliveryLiters = (index: number, tankId: string, text: string): void => {
    const list = [...day.deliveries]
    const parsed = parseMeter(text)
    list[index] = {
      ...list[index],
      litersByTank: {
        ...list[index].litersByTank,
        [tankId]: parsed ?? 0
      }
    }
    onDayChange({ ...day, deliveries: list })
  }

  return (
    <Accordion variant="separated" multiple>
      <Accordion.Item value="deductions">
        <Accordion.Control>หักทดสอบ น้ำมันใช้เอง ส่วนลด และภาษีซื้อ — กรอกเฉพาะวันที่มียอด</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm" c="dimmed" mb="sm">
            ทดสอบน้ำมันหักในส่วน ก และบวกกลับถังในส่วน ข ดีเซลใส่ที่ถังแรกของชนิดนั้น (หัว 1, 5)
          </Text>
          <div data-entry-group>
          <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>รายการ</Table.Th>
                {fuels.map((fuel) => (
                  <Table.Th key={fuel.id}>{fuel.nameTh}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <AdjustmentRow
                label="ทดสอบน้ำมัน (ลิตร)"
                field="testLiters"
                fuels={fuels}
                day={day}
                onChange={patchAdjustment}
              />
              <AdjustmentRow
                label="น้ำมันใช้เอง (ลิตร)"
                field="ownUseLiters"
                fuels={fuels}
                day={day}
                onChange={patchAdjustment}
              />
              <AdjustmentRow
                label="ส่วนลดการค้า (บาท)"
                field="tradeDiscountBaht"
                fuels={fuels}
                day={day}
                onChange={patchAdjustment}
              />
              <AdjustmentRow
                label="เงินเชื่อ (บาท)"
                field="creditDiscountBaht"
                fuels={fuels}
                day={day}
                onChange={patchAdjustment}
              />
              <AdjustmentRow
                label="ภาษีซื้อ (บาท)"
                field="inputVatBaht"
                fuels={fuels}
                day={day}
                onChange={patchAdjustment}
              />
            </Table.Tbody>
          </Table>
          </div>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="delivery">
        <Accordion.Control>ยอดรับน้ำมัน — กรอกเฉพาะวันที่รถบรรทุกมาส่ง</Accordion.Control>
        <Accordion.Panel>
          <Text size="sm" c="dimmed" mb="sm">
            วันนี้ไม่มีรถบรรทุก ข้ามได้
          </Text>
          {day.deliveries.length > 0 ? (
            <div data-entry-group>
            <Table withTableBorder withColumnBorders mb="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ลำดับ</Table.Th>
                  <Table.Th>เลขที่ใบจ่ายน้ำมัน</Table.Th>
                  <Table.Th>วันที่</Table.Th>
                  <Table.Th>คลังน้ำมันผู้ขายส่ง</Table.Th>
                  <Table.Th>ชื่อผู้จ่ายน้ำมัน</Table.Th>
                  {tanks.map((tank) => (
                    <Table.Th key={tank.id}>
                      ถังที่ {tank.tankNo}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {day.deliveries.map((note, index) => (
                  <Table.Tr key={`${note.seq}-${index}`}>
                    <Table.Td>{note.seq || index + 1}</Table.Td>
                    <Table.Td>
                      <TextInput
                        {...entryInputProps}
                        value={note.number}
                        onChange={(event) => patchDelivery(index, { number: event.target.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        {...entryInputProps}
                        value={note.date}
                        onChange={(event) => patchDelivery(index, { date: event.target.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        {...entryInputProps}
                        value={note.wholesaler}
                        onChange={(event) => patchDelivery(index, { wholesaler: event.target.value })}
                      />
                    </Table.Td>
                    <Table.Td>
                      <TextInput
                        {...entryInputProps}
                        value={note.issuer}
                        onChange={(event) => patchDelivery(index, { issuer: event.target.value })}
                      />
                    </Table.Td>
                    {tanks.map((tank) => (
                      <Table.Td key={tank.id}>
                        <DecimalInput
                          entry
                          className="kor-input extras-input"
                          value={note.litersByTank?.[tank.id] || null}
                          onCommit={(parsed) =>
                            patchDeliveryLiters(index, tank.id, parsed == null ? '' : String(parsed))
                          }
                        />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            </div>
          ) : null}
          <Button mt="sm" variant="light" onClick={addDelivery}>
            เพิ่มแถวใบจ่ายน้ำมัน
          </Button>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  )
}

function AdjustmentRow({
  label,
  field,
  fuels,
  day,
  onChange
}: {
  label: string
  field: keyof FuelAdjustments
  fuels: ReturnType<typeof sortedFuelTypes>
  day: DayRecord
  onChange: (fuelTypeId: string, field: keyof FuelAdjustments, text: string) => void
}): JSX.Element {
  return (
    <Table.Tr>
      <Table.Td>{label}</Table.Td>
      {fuels.map((fuel) => {
        const value = adjustmentsFor(day, fuel.id)[field]
        return (
          <Table.Td key={fuel.id}>
            <DecimalInput
              entry
              className="kor-input extras-input"
              value={value || null}
              onCommit={(parsed) => onChange(fuel.id, field, parsed == null ? '' : String(parsed))}
              ariaLabel={`${label} ${fuel.nameTh}`}
            />
          </Table.Td>
        )
      })}
    </Table.Tr>
  )
}

