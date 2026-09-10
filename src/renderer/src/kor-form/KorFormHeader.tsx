import type { JSX } from 'react'
import { KOR_FORM_TITLE, EMPTY_KOR_HEADER, type KorFormHeaderValues } from './sampleHeader'

interface KorFormHeaderProps {
  data?: KorFormHeaderValues
  part?: string
}

export function KorFormHeader({
  data = EMPTY_KOR_HEADER,
  part = 'ส่วน ก.'
}: KorFormHeaderProps): JSX.Element {
  return (
    <header className="kor-header">
      <div className="kor-header__corner">
        <div className="kor-header__printed">วันที่พิมพ์ : {data.printedAt}</div>
        <div className="kor-header__part">{part}</div>
      </div>

      <div className="kor-header__titles">
        <div className="kor-header__title">{KOR_FORM_TITLE}</div>
        <div className="kor-header__period">{data.period}</div>
      </div>

      <div className="kor-header__fields">
        <div className="kor-header__row">
          <span className="kor-header__label">ชื่อผู้ประกอบการ :</span>
          <span className="kor-header__value">{data.operatorName}</span>
        </div>

        <div className="kor-header__row kor-header__row--split">
          <div className="kor-header__left">
            <span className="kor-header__label">ชื่อสถานีน้ำมัน :</span>
            <span className="kor-header__value">{data.stationName}</span>
          </div>
          <div className="kor-header__right">
            <span className="kor-header__label">เลขที่ประจำตัวผู้เสียภาษี :</span>
            <span className="kor-header__value">{data.taxId}</span>
          </div>
        </div>

        <div className="kor-header__row kor-header__row--split">
          <div className="kor-header__left">
            <span className="kor-header__label">ที่อยู่สถานประกอบการ :</span>
            <span className="kor-header__value">{data.address}</span>
          </div>
          <div className="kor-header__right">
            <span className="kor-header__label">สาขา :</span>
            <span className="kor-header__value">{data.branch}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
