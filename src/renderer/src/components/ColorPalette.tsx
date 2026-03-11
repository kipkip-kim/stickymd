import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { COLOR_PRESETS, DARK_NOTE_BG, isLightColor } from '../constants/colors'
import styles from './ColorPalette.module.css'

interface ColorPaletteProps {
  currentColor: string
  isDark: boolean
  onColorChange: (color: string) => void
  onClose: () => void
  excludeRef?: React.RefObject<HTMLElement | null>
}

export default function ColorPalette({
  currentColor,
  isDark,
  onColorChange,
  onClose,
  excludeRef
}: ColorPaletteProps): React.JSX.Element {
  const [showPicker, setShowPicker] = useState(false)
  const [customColor, setCustomColor] = useState(currentColor)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      const target = e.target as Node
      if (containerRef.current && containerRef.current.contains(target)) return
      if (excludeRef?.current && excludeRef.current.contains(target)) return
      onClose()
    }
    // Delay to avoid immediate close from the button click that opened this
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 150)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose, excludeRef])

  const handlePresetClick = (color: string): void => {
    onColorChange(color)
    onClose()
  }

  const handleCustomConfirm = (): void => {
    onColorChange(customColor)
    onClose()
  }

  return (
    <div className={`${styles.container} ${isDark ? styles.dark : ''}`} ref={containerRef}>
      <div className={styles.presets}>
        <button
          className={`${styles.swatch} ${currentColor === DARK_NOTE_BG ? styles.swatchSelected : ''}`}
          onClick={() => handlePresetClick(DARK_NOTE_BG)}
          title="다크"
        >
          <div className={styles.swatchInner} style={{ backgroundColor: DARK_NOTE_BG }} />
        </button>
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.name}
            className={`${styles.swatch} ${currentColor === preset.light ? styles.swatchSelected : ''}`}
            onClick={() => handlePresetClick(preset.light)}
            title={preset.name}
          >
            <div className={styles.swatchInner} style={{ backgroundColor: preset.light }} />
          </button>
        ))}
        <button
          className={styles.customBtn}
          onClick={() => setShowPicker(!showPicker)}
          title="커스텀 색상"
        >
          +
        </button>
      </div>
      {showPicker && (
        <div className={styles.pickerWrapper}>
          <HexColorPicker color={customColor} onChange={setCustomColor} />
          <button
            onClick={handleCustomConfirm}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '4px 8px',
              border: '1px solid rgba(0,0,0,0.2)',
              borderRadius: 4,
              background: customColor,
              color: isLightColor(customColor) ? '#000' : '#fff',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            적용
          </button>
        </div>
      )}
    </div>
  )
}
