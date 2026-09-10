import { useState, type JSX } from 'react'
import { Button, Group, Stack, Stepper, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  prepareStationConfig,
  validateIdentity,
  validateStationConfig,
  type StationConfig,
  type StationIdentity
} from '../../shared/station'
import { completeSetup } from '../../shared/store'
import { IdentityFields } from './IdentityFields'
import { StationConfigEditor } from './StationConfigEditor'
import { useStationStore } from './StationStore'

export function SetupPage({
  allowCancel,
  onDone,
  onCancel
}: {
  allowCancel: boolean
  onDone: () => void
  onCancel: () => void
}): JSX.Element {
  const { store, setStore } = useStationStore()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [identity, setIdentity] = useState<StationIdentity>(store.identity)
  const [config, setConfig] = useState<StationConfig>(store.config)

  const fail = (message: string): void => {
    notifications.show({ color: 'red', title: 'กรอกไม่ครบ', message })
  }

  const goNext = (): void => {
    if (step === 0) {
      const problem = validateIdentity(identity)
      if (problem) {
        fail(problem)
        return
      }
      setStep(1)
      return
    }

    if (step === 1) {
      const prepared = prepareStationConfig(config)
      if (prepared.fuelTypes.length === 0) {
        fail('ต้องมีประเภทน้ำมันอย่างน้อย 1 ชนิด')
        return
      }
      if (prepared.fuelTypes.some((fuel) => fuel.nameTh.trim() === '')) {
        fail('กรอกชื่อประเภทน้ำมันให้ครบ')
        return
      }
      if (prepared.machines.length === 0) {
        fail('ต้องมีหัวจ่ายอย่างน้อย 1 หัว')
        return
      }
      const nozzleNos = prepared.machines.map((machine) => machine.nozzleNo)
      if (new Set(nozzleNos).size !== nozzleNos.length) {
        fail('เลขหัวจ่ายซ้ำกัน')
        return
      }
      setConfig(prepared)
      setStep(2)
    }
  }

  const finish = async (): Promise<void> => {
    const identityProblem = validateIdentity(identity)
    if (identityProblem) {
      fail(identityProblem)
      setStep(0)
      return
    }

    const prepared = prepareStationConfig(config)
    const configProblem = validateStationConfig(prepared)
    if (configProblem) {
      fail(configProblem)
      return
    }

    const next = completeSetup(store, identity, prepared)
    setSaving(true)
    try {
      if (!window.api) {
        setStore(next)
        notifications.show({
          color: 'yellow',
          title: 'โหมดดูตัวอย่าง',
          message: 'บันทึกในเครื่องได้เมื่อเปิดจากโปรแกรม'
        })
        onDone()
        return
      }
      const response = await window.api.saveStore(next)
      if (!response.ok) {
        notifications.show({ color: 'red', title: 'บันทึกไม่สำเร็จ', message: response.message })
        return
      }
      setStore(next)
      notifications.show({
        color: 'teal',
        title: 'ตั้งค่าแล้ว',
        message: 'เริ่มบันทึกมิเตอร์รายวันได้'
      })
      onDone()
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'บันทึกไม่สำเร็จ',
        message: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด'
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack gap="lg" maw={1100} mx="auto" py="xl" px="md">
      <div>
        <Title order={2}>ตั้งค่าเริ่มต้น</Title>
        <Text c="dimmed">
          กรอกครั้งเดียว แล้วใช้บันทึกรายวันได้ทุกวัน แก้ภายหลังได้ที่ตั้งค่าสถานี
        </Text>
      </div>

      <Stepper active={step} allowNextStepsSelect={false}>
        <Stepper.Step label="สถานี" />
        <Stepper.Step label="หัวจ่าย" />
        <Stepper.Step label="ถัง" />
      </Stepper>

      {step === 0 ? (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            ข้อมูลนี้พิมพ์บนรายงานส่วน ก และ ข
          </Text>
          <IdentityFields
            identity={identity}
            onChange={(patch) => setIdentity((current) => ({ ...current, ...patch }))}
          />
        </Stack>
      ) : null}

      {step === 1 ? (
        <Stack gap="lg">
          <div>
            <Title order={4}>ตรวจหัวจ่ายให้ตรงของจริง แล้วกรอกมิเตอร์เช้านี้</Title>
            <Text size="sm" c="dimmed">
              ตัวเลขบนมิเตอร์ตอนนี้ ไม่ใช่ยอดขาย หัวที่ไม่เปิดใช้ให้ติ๊ก ไม่ใช้
            </Text>
          </div>
          <StationConfigEditor
            config={config}
            onChange={setConfig}
            showFuels
            showMachines
            showTanks={false}
            simpleMode
          />
        </Stack>
      ) : null}

      {step === 2 ? (
        <Stack gap="lg">
          <div>
            <Title order={4}>ยอดน้ำมันในถังเช้าวันแรก</Title>
            <Text size="sm" c="dimmed">
              5 ถัง: E20, แก๊สโซฮอล์ 95, ดีเซลหัว 1 และ 5, ดีเซลหัว 7 และ 8, ดีเซลหัว 9 และ 10
              ยอดยกมา = ไม้วัดเช้านี้ ผลต่างสะสมยกมา = แถว 9 จากรายงานส่วน ข ล่าสุดบนกระดาษ
              ถ้าเริ่มวันที่ 1 หรือไม่มีผลต่างสะสม ให้ว่างไว้ = 0
            </Text>
          </div>
          <StationConfigEditor
            config={config}
            onChange={setConfig}
            showFuels={false}
            showMachines={false}
            showTanks
            simpleMode
          />
        </Stack>
      ) : null}

      <Group justify="space-between">
        <Group>
          {allowCancel ? (
            <Button variant="subtle" onClick={onCancel}>
              ยกเลิก
            </Button>
          ) : null}
          {step > 0 ? (
            <Button variant="default" onClick={() => setStep((current) => current - 1)}>
              ย้อนกลับ
            </Button>
          ) : null}
        </Group>
        {step < 2 ? (
          <Button onClick={goNext}>ถัดไป</Button>
        ) : (
          <Button loading={saving} onClick={() => void finish()}>
            เริ่มบันทึกรายวัน
          </Button>
        )}
      </Group>
    </Stack>
  )
}
