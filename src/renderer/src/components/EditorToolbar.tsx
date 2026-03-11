import { useCallback } from 'react'
import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  wrapInBulletListCommand
} from '@milkdown/kit/preset/commonmark'
import { toggleUnderlineCommand } from '../plugins/underline-plugin'
import styles from './EditorToolbar.module.css'

interface EditorToolbarProps {
  getEditor: () => Editor | undefined
  memoId: string
  opacity: number
  onOpacityChange: (opacity: number) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
}

export default function EditorToolbar({
  getEditor,
  memoId,
  opacity,
  onOpacityChange,
  fontSize,
  onFontSizeChange
}: EditorToolbarProps): React.JSX.Element {
  // B4: onMouseDown + preventDefault to prevent editor focus loss
  const preventBlur = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  // Sliders need default mouseDown for drag — only stopPropagation (no preventDefault)
  const allowSliderDrag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
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
      const editor = getEditor()
      if (editor) {
        editor.action(callCommand(toggleUnderlineCommand.key))
      }
    },
    [getEditor]
  )

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const editor = getEditor()
      if (!editor) return
      const view = editor.ctx.get(editorViewCtx)
      const { state } = view
      const { schema, tr, selection } = state
      const listItemType = schema.nodes['list_item']
      const bulletListType = schema.nodes['bullet_list']
      if (!listItemType || !bulletListType) return

      // Check if cursor is in a list_item with checked attribute
      const $pos = selection.$from
      for (let depth = $pos.depth; depth > 0; depth--) {
        const node = $pos.node(depth)
        if (node.type === listItemType) {
          // Toggle checked attribute
          const checked = node.attrs.checked
          if (checked === null || checked === undefined) {
            // Not a task item → make it one
            view.dispatch(tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: false }))
          } else {
            // Toggle checked state
            view.dispatch(tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: !checked }))
          }
          return
        }
      }

      // Not in a list → wrap in bullet list first, then set checked attribute
      editor.action(callCommand(wrapInBulletListCommand.key))
      // After wrapping, find the list_item and set checked
      const newView = editor.ctx.get(editorViewCtx)
      const newState = newView.state
      const $newPos = newState.selection.$from
      for (let d = $newPos.depth; d > 0; d--) {
        const n = $newPos.node(d)
        if (n.type === listItemType) {
          newView.dispatch(newState.tr.setNodeMarkup($newPos.before(d), undefined, { ...n.attrs, checked: false }))
          break
        }
      }
    },
    [getEditor]
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

  const handleFontSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFontSizeChange(parseInt(e.target.value, 10))
    },
    [onFontSizeChange]
  )

  const handleOpacityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10) / 100
      onOpacityChange(val)
      window.api.setOpacity(memoId, val)
        .catch((err) => console.error('setOpacity failed:', err))
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
        <span className={styles.sliderLabel}>가 {fontSize}</span>
        <input
          type="range"
          className={styles.slider}
          min={10}
          max={28}
          step={1}
          value={fontSize}
          onChange={handleFontSizeChange}
          onMouseDown={allowSliderDrag}
          tabIndex={-1}
        />
      </div>
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
          onMouseDown={allowSliderDrag}
          tabIndex={-1}
        />
      </div>
    </div>
  )
}
