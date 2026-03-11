import { useCallback } from 'react'
import type { Editor } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  wrapInBulletListCommand
} from '@milkdown/kit/preset/commonmark'
import styles from './EditorToolbar.module.css'

interface EditorToolbarProps {
  getEditor: () => Editor | undefined
  memoId: string
  opacity: number
  onOpacityChange: (opacity: number) => void
  onToggleUnderline: () => void
  onToggleCheckbox: () => void
}

export default function EditorToolbar({
  getEditor,
  memoId,
  opacity,
  onOpacityChange,
  onToggleUnderline,
  onToggleCheckbox
}: EditorToolbarProps): React.JSX.Element {
  // B4: onMouseDown + preventDefault to prevent editor focus loss
  const preventBlur = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const handleBold = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const editor = getEditor()
      if (editor) {
        editor.action(callCommand(toggleStrongCommand.key))
      }
    },
    [getEditor]
  )

  const handleUnderline = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onToggleUnderline()
    },
    [onToggleUnderline]
  )

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      onToggleCheckbox()
    },
    [onToggleCheckbox]
  )

  const handleBulletList = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const editor = getEditor()
      if (editor) {
        editor.action(callCommand(wrapInBulletListCommand.key))
      }
    },
    [getEditor]
  )

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10) / 100
      onOpacityChange(val)
      window.api.setOpacity(memoId, val)
    },
    [memoId, onOpacityChange]
  )

  return (
    <div className={styles.toolbar} onMouseDown={preventBlur}>
      <button
        className={styles.btn}
        onMouseDown={handleBold}
        title="굵게 (Ctrl+B)"
      >
        B
      </button>
      <button
        className={styles.btn}
        onMouseDown={handleUnderline}
        title="밑줄 (Ctrl+U)"
        style={{ textDecoration: 'underline' }}
      >
        U
      </button>
      <button
        className={styles.btn}
        onMouseDown={handleCheckbox}
        title="체크박스"
      >
        ☑
      </button>
      <button
        className={styles.btn}
        onMouseDown={handleBulletList}
        title="글머리 기호"
      >
        •
      </button>
      <div className={styles.separator} />
      <div className={styles.sliderGroup}>
        <span className={styles.sliderLabel}>{Math.round(opacity * 100)}%</span>
        <input
          type="range"
          className={styles.slider}
          min={30}
          max={100}
          step={10}
          value={Math.round(opacity * 100)}
          onChange={handleOpacityChange}
          onMouseDown={preventBlur}
          tabIndex={-1}
        />
      </div>
    </div>
  )
}
