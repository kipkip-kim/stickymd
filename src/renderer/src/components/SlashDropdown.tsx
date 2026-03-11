import { useEffect, useRef } from 'react'
import type { SlashCommand } from '../constants/slash-commands'
import styles from './SlashDropdown.module.css'

interface SlashDropdownProps {
  commands: SlashCommand[]
  selectedIndex: number
  position: { top: number; left: number }
  maxWidth: number
  onSelect: (command: SlashCommand) => void
}

export default function SlashDropdown({
  commands,
  selectedIndex,
  position,
  maxWidth,
  onSelect
}: SlashDropdownProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Adjust position to prevent overflow off-screen
  const adjustedPosition = { ...position }
  if (containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    if (rect.bottom > viewportHeight) {
      // Show above the cursor instead
      adjustedPosition.top = position.top - rect.height - 24
    }
  }

  const width = Math.min(maxWidth, 240)

  return (
    <div
      ref={containerRef}
      className={styles.dropdown}
      style={{
        top: adjustedPosition.top,
        left: adjustedPosition.left,
        width
      }}
    >
      {commands.length === 0 ? (
        <div className={styles.empty}>일치하는 명령 없음</div>
      ) : (
        commands.slice(0, 8).map((cmd, i) => (
          <button
            key={cmd.id}
            ref={i === selectedIndex ? selectedRef : undefined}
            className={`${styles.item} ${i === selectedIndex ? styles.itemSelected : ''}`}
            onMouseDown={(e) => {
              e.preventDefault() // Prevent editor blur
              onSelect(cmd)
            }}
          >
            <span className={styles.icon}>{cmd.icon}</span>
            <span className={styles.labels}>
              <span className={styles.label}>/{cmd.labelEn} /{cmd.labelKo}</span>
              <span className={styles.description}>{cmd.description}</span>
            </span>
          </button>
        ))
      )}
    </div>
  )
}
