import { useState, useCallback, useEffect, useRef } from 'react'
import type { AlarmData } from '../../../shared/types'
import styles from './AlarmPopover.module.css'

interface AlarmPopoverProps {
  onSave: (alarm: AlarmData) => void
  onClearAll?: () => void
  onClose: () => void
  excludeRef?: React.RefObject<HTMLElement | null>
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const TYPE_LABELS: Record<AlarmData['type'], string> = {
  once: '한 번',
  daily: '매일',
  weekdays: '매주',
  daterange: '기간 설정'
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AlarmPopover({
  onSave,
  onClearAll,
  onClose,
  excludeRef
}: AlarmPopoverProps): React.JSX.Element {
  const [hour, setHour] = useState(9)
  const [minute, setMinute] = useState(0)
  const [type, setType] = useState<AlarmData['type']>('once')
  const [date, setDate] = useState(todayStr())
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [startDate, setStartDate] = useState(todayStr())
  const [endDate, setEndDate] = useState(todayStr())

  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      const target = e.target as Node
      // Ignore clicks inside the popover
      if (popoverRef.current && popoverRef.current.contains(target)) return
      // Ignore clicks on the alarm toggle button (handled by Titlebar)
      if (excludeRef?.current && excludeRef.current.contains(target)) return
      onClose()
    }
    // Delay to prevent immediate close from the button click that opened us
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick)
    }, 150)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [onClose, excludeRef])

  const toggleWeekday = useCallback((day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }, [])

  const handleSave = useCallback(() => {
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const alarmData: AlarmData = {
      enabled: true,
      time: timeStr,
      type
    }

    switch (type) {
      case 'once':
        alarmData.date = date
        break
      case 'weekdays':
        alarmData.weekdays = weekdays.length > 0 ? weekdays : [new Date().getDay()]
        break
      case 'daterange':
        alarmData.startDate = startDate
        alarmData.endDate = endDate
        break
    }

    onSave(alarmData)
  }, [hour, minute, type, date, weekdays, startDate, endDate, onSave])

  return (
    <div className={styles.popover} ref={popoverRef}>
      <div className={styles.header}>알람 추가</div>

      {/* Time picker */}
      <div className={styles.row}>
        <span className={styles.label}>시간</span>
        <select
          className={styles.timeSelect}
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>
              {String(i).padStart(2, '0')}
            </option>
          ))}
        </select>
        <span className={styles.timeSeparator}>:</span>
        <select
          className={styles.timeSelect}
          value={minute}
          onChange={(e) => setMinute(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')}
            </option>
          ))}
        </select>
      </div>

      {/* Type selector */}
      <div className={styles.row}>
        <span className={styles.label}>유형</span>
        <select
          className={styles.typeSelect}
          value={type}
          onChange={(e) => setType(e.target.value as AlarmData['type'])}
        >
          {(Object.keys(TYPE_LABELS) as AlarmData['type'][]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {/* Type-specific fields */}
      {type === 'once' && (
        <div className={styles.row}>
          <span className={styles.label}>날짜</span>
          <input
            type="date"
            className={styles.dateInput}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      )}

      {type === 'weekdays' && (
        <div className={styles.row}>
          <span className={styles.label}>요일</span>
          <div className={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={`${styles.weekdayBtn} ${weekdays.includes(i) ? styles.weekdayBtnActive : ''}`}
                onClick={() => toggleWeekday(i)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'daterange' && (
        <>
          <div className={styles.dateRangeRow}>
            <span className={styles.dateRangeLabel}>시작</span>
            <input
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className={styles.dateRangeRow}>
            <span className={styles.dateRangeLabel}>종료</span>
            <input
              type="date"
              className={styles.dateInput}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </>
      )}

      {/* Buttons */}
      <div className={styles.buttons}>
        {onClearAll ? (
          <button className={styles.btnDelete} onClick={onClearAll} type="button">
            전체 삭제
          </button>
        ) : (
          <div />
        )}
        <div className={styles.btnGroup}>
          <button className={styles.btnCancel} onClick={onClose} type="button">
            취소
          </button>
          <button className={styles.btnSave} onClick={handleSave} type="button">
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
