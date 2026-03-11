import { useState, useCallback, useRef } from 'react'
import ColorPalette from './ColorPalette'
import styles from './Titlebar.module.css'

interface TitlebarProps {
  memoId: string
  isRolledUp: boolean
  title?: string
  color: string
  isDark: boolean
  onColorChange: (color: string) => void
  onCopy: () => void
}

export default function Titlebar({
  memoId,
  isRolledUp,
  title,
  color,
  isDark,
  onColorChange,
  onCopy
}: TitlebarProps): React.JSX.Element {
  const [isPinned, setIsPinned] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      <div className={styles.leftButtons}>
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
      <div className={styles.buttons}>
        {/* Phase 13b: alarm button will be added here */}
        <button
          className={styles.btn}
          onClick={handleCopy}
          title={copied ? '복사됨!' : '메모 복사'}
        >
          {copied ? '✓' : '📋'}
        </button>
        <button
          className={styles.colorBtn}
          onClick={() => setShowPalette(!showPalette)}
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
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  )
}
