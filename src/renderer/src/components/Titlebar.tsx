import { useState, useCallback, useRef, useEffect } from 'react'
import type { AlarmData } from '../../../shared/types'
import ColorPalette from './ColorPalette'
import AlarmPopover from './AlarmPopover'
import styles from './Titlebar.module.css'

interface TitlebarProps {
  memoId: string
  isRolledUp: boolean
  title?: string
  color: string
  isDark: boolean
  onColorChange: (color: string) => void
  onCopy: () => void
  alarm: AlarmData | null
  onAlarmSave: (alarm: AlarmData) => void
  onAlarmClear: () => void
}

export default function Titlebar({
  memoId,
  isRolledUp,
  title,
  color,
  isDark,
  onColorChange,
  onCopy,
  alarm,
  onAlarmSave,
  onAlarmClear
}: TitlebarProps): React.JSX.Element {
  const [isPinned, setIsPinned] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showAlarm, setShowAlarm] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alarmBtnRef = useRef<HTMLButtonElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  // Track if button was just clicked to prevent outside-click race
  const alarmToggleRef = useRef(false)
  const colorToggleRef = useRef(false)

  // Sync pin state on mount
  useEffect(() => {
    window.api.getPin(memoId).then(setIsPinned).catch(() => {})
  }, [memoId])

  const handleCopy = useCallback(() => {
    onCopy()
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [onCopy])

  const handlePin = useCallback(async () => {
    try {
      const newState = await window.api.togglePin(memoId)
      setIsPinned(newState)
    } catch (e) {
      console.error('togglePin failed:', e)
    }
  }, [memoId])

  const handleRollup = useCallback(async () => {
    try {
      await window.api.toggleRollup(memoId)
    } catch (e) {
      console.error('toggleRollup failed:', e)
    }
  }, [memoId])

  const handleNew = useCallback(async () => {
    try {
      await window.api.createWindow(memoId)
    } catch (e) {
      console.error('createWindow failed:', e)
    }
  }, [memoId])

  const handleClose = useCallback(async () => {
    try {
      await window.api.closeWindow(memoId)
    } catch (e) {
      console.error('closeWindow failed:', e)
    }
  }, [memoId])

  const handleDoubleClick = useCallback(async () => {
    try {
      await window.api.toggleRollup(memoId)
    } catch (e) {
      console.error('toggleRollup failed:', e)
    }
  }, [memoId])

  const handleOpenManager = useCallback(async () => {
    try {
      await window.api.openManager()
    } catch (e) {
      console.error('openManager failed:', e)
    }
  }, [])

  return (
    <div className={styles.titlebar} onDoubleClick={handleDoubleClick}>
      <div className={styles.leftButtons} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
        <button
          className={styles.btn}
          onClick={handleNew}
          title="새 메모"
        >
          +
        </button>
        <button
          className={`${styles.btn} ${isPinned ? styles.btnActive : ''}`}
          onClick={handlePin}
          title={isPinned ? '고정 해제' : '항상 위에'}
        >
          📌
        </button>
        <button
          className={styles.btn}
          onClick={handleOpenManager}
          title="메모 목록"
        >
          ☰
        </button>
        <button
          className={styles.btn}
          onClick={handleRollup}
          title={isRolledUp ? '펼치기' : '접기'}
        >
          {isRolledUp ? '▼' : '▲'}
        </button>
      </div>
      <span className={styles.title}>{title || '새 메모'}</span>
      <div className={styles.buttons} onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
        <button
          ref={alarmBtnRef}
          className={`${styles.btn} ${alarm?.enabled ? styles.btnAlarmActive : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            // Mark that we're toggling to prevent outside-click race
            alarmToggleRef.current = true
            setTimeout(() => { alarmToggleRef.current = false }, 200)
            setShowAlarm((prev) => !prev)
          }}
          title={alarm?.enabled ? `알람: ${alarm.time}` : '알람 설정'}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill={alarm?.enabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-1.5 4-1.5 4h12s-1.5-1.5-1.5-4A4.5 4.5 0 008 1.5z" />
            <path d="M6.5 13a1.5 1.5 0 003 0" />
          </svg>
        </button>
        <button
          className={styles.btn}
          onClick={handleCopy}
          title={copied ? '복사됨!' : '메모 복사'}
        >
          {copied ? '✓' : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
              <path d="M10.5 5.5V3a1.5 1.5 0 00-1.5-1.5H3A1.5 1.5 0 001.5 3v6A1.5 1.5 0 003 10.5h2.5" />
            </svg>
          )}
        </button>
        <button
          ref={colorBtnRef}
          className={styles.colorBtn}
          onClick={() => {
            colorToggleRef.current = true
            setTimeout(() => { colorToggleRef.current = false }, 200)
            setShowPalette((prev) => !prev)
          }}
          title="색상 변경"
        >
          <div className={styles.colorDot} style={{ backgroundColor: color }} />
        </button>
        <button
          className={`${styles.btn} ${styles.closeBtn}`}
          onClick={handleClose}
          title="닫기"
        >
          ×
        </button>
      </div>
      {showPalette && (
        <ColorPalette
          currentColor={color}
          isDark={isDark}
          onColorChange={onColorChange}
          onClose={() => {
            if (colorToggleRef.current) return
            setShowPalette(false)
          }}
          excludeRef={colorBtnRef}
        />
      )}
      {showAlarm && (
        <AlarmPopover
          alarm={alarm}
          onSave={(a) => { onAlarmSave(a); setShowAlarm(false) }}
          onClear={() => { onAlarmClear(); setShowAlarm(false) }}
          onClose={() => {
            // Prevent close if alarm button was just clicked (toggle race)
            if (alarmToggleRef.current) return
            setShowAlarm(false)
          }}
          excludeRef={alarmBtnRef}
        />
      )}
    </div>
  )
}
