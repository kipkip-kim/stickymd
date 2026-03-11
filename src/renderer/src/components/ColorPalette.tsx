import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { COLOR_PRESETS } from '../constants/colors'
import styles from './ColorPalette.module.css'

function isLightColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}

interface ColorPaletteProps {
  currentColor: string
  isDark: boolean
  onColorChange: (color: string) => void
  onClose: () => void
}

export default function ColorPalette({
  currentColor,
  isDark,
  onColorChange,
  onClose
}: ColorPaletteProps): React.JSX.Element {
  const [showPicker, setShowPicker] = useState(false)
  const [customColor, setCustomColor] = useState(currentColor)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the button click that opened this
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

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
