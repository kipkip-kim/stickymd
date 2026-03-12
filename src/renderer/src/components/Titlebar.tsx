import { useState, useCallback, useRef, useEffect } from 'react'
import type { AlarmData } from '../../../shared/types'
import ColorPalette from './ColorPalette'
import AlarmPopover from './AlarmPopover'
import styles from './Titlebar.module.css'

type TitlebarStyle = 'compact' | 'default' | 'spacious'

const TITLEBAR_HEIGHTS: Record<TitlebarStyle, number> = {
  compact: 28,
  default: 36,
  spacious: 44
}

const TITLEBAR_ICON_SIZES: Record<TitlebarStyle, number> = {
  compact: 18,
  default: 24,
  spacious: 30
}

const TITLEBAR_FONT_SIZES: Record<TitlebarStyle, number> = {
  compact: 10,
  default: 12,
  spacious: 14
}

const TITLEBAR_BTN_FONT_SIZES: Record<TitlebarStyle, number> = {
  compact: 12,
  default: 14,
  spacious: 16
}

const TITLEBAR_SVG_SIZES: Record<TitlebarStyle, number> = {
  compact: 11,
  default: 13,
  spacious: 16
}

const TITLEBAR_COLOR_DOT_SIZES: Record<TitlebarStyle, number> = {
  compact: 12,
  default: 16,
  spacious: 20
}

interface TitlebarProps {
  memoId: string
  isRolledUp: boolean
  title?: string
  color: string
  isDark: boolean
  onColorChange: (color: string) => void
  onCopy: () => void
  alarms: AlarmData[]
  onAlarmAdd: (alarm: AlarmData) => void
  onAlarmClearAll: () => void
  titlebarStyle?: TitlebarStyle
}

export default function Titlebar({
  memoId,
  isRolledUp,
  title,
  color,
  isDark,
  onColorChange,
  onCopy,
  alarms,
  onAlarmAdd,
  onAlarmClearAll,
  titlebarStyle = 'default'
}: TitlebarProps): React.JSX.Element {
  const titlebarHeight = TITLEBAR_HEIGHTS[titlebarStyle]
  const iconSize = TITLEBAR_ICON_SIZES[titlebarStyle]
  const titleFontSize = TITLEBAR_FONT_SIZES[titlebarStyle]
  const btnFontSize = TITLEBAR_BTN_FONT_SIZES[titlebarStyle]
  const svgSize = TITLEBAR_SVG_SIZES[titlebarStyle]
  const colorDotSize = TITLEBAR_COLOR_DOT_SIZES[titlebarStyle]
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
    <div
      className={styles.titlebar}
      style={{
        height: titlebarHeight,
        '--tb-icon-size': `${iconSize}px`,
        '--tb-title-font': `${titleFontSize}px`,
        '--tb-btn-font': `${btnFontSize}px`,
        '--tb-svg-size': `${svgSize}px`,
        '--tb-dot-size': `${colorDotSize}px`
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
    >
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
          className={`${styles.btn} ${alarms.length > 0 ? styles.btnAlarmActive : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            // Mark that we're toggling to prevent outside-click race
            alarmToggleRef.current = true
            setTimeout(() => { alarmToggleRef.current = false }, 200)
            setShowAlarm((prev) => !prev)
          }}
          title={alarms.length > 0 ? `알람 ${alarms.length}개` : '알람 설정'}
        >
          <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill={alarms.length > 0 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
            <svg width={svgSize} height={svgSize} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
          onSave={(a) => { onAlarmAdd(a); setShowAlarm(false) }}
          onClearAll={alarms.length > 0 ? () => { onAlarmClearAll(); setShowAlarm(false) } : undefined}
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
