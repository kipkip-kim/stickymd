import { useState, useCallback } from 'react'
import ColorPalette from './ColorPalette'
import styles from './Titlebar.module.css'

interface TitlebarProps {
  memoId: string
  isRolledUp: boolean
  title?: string
  color: string
  onColorChange: (color: string) => void
}

export default function Titlebar({
  memoId,
  isRolledUp,
  title,
  color,
  onColorChange
}: TitlebarProps): React.JSX.Element {
  const [isPinned, setIsPinned] = useState(false)
  const [showPalette, setShowPalette] = useState(false)

  const handlePin = useCallback(async () => {
    const newState = await window.api.togglePin(memoId)
    setIsPinned(newState)
  }, [memoId])

  const handleRollup = useCallback(async () => {
    await window.api.toggleRollup(memoId)
  }, [memoId])

  const handleNew = useCallback(async () => {
    await window.api.createWindow(memoId)
  }, [memoId])

  const handleClose = useCallback(async () => {
    await window.api.closeWindow(memoId)
  }, [memoId])

  const handleDoubleClick = useCallback(async () => {
    await window.api.toggleRollup(memoId)
  }, [memoId])

  return (
    <div className={styles.titlebar} onDoubleClick={handleDoubleClick}>
      <div className={styles.leftButtons}>
        {/* Color button */}
        <button
          className={styles.colorBtn}
          onClick={() => setShowPalette(!showPalette)}
          title="색상 변경"
        >
          <div className={styles.colorDot} style={{ backgroundColor: color }} />
        </button>
      </div>
      <span className={styles.title}>{title || '새 메모'}</span>
      <div className={styles.buttons}>
        <button
          className={`${styles.btn} ${isPinned ? styles.btnActive : ''}`}
          onClick={handlePin}
          title={isPinned ? '고정 해제' : '항상 위에'}
        >
          📌
        </button>
        <button
          className={styles.btn}
          onClick={handleRollup}
          title={isRolledUp ? '펼치기' : '접기'}
        >
          {isRolledUp ? '▼' : '▲'}
        </button>
        <button
          className={styles.btn}
          onClick={handleNew}
          title="새 메모"
        >
          +
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
          onColorChange={onColorChange}
          onClose={() => setShowPalette(false)}
        />
      )}
    </div>
  )
}
