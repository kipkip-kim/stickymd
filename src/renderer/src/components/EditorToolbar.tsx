import { useCallback, useMemo } from 'react'
import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand,
  setBlockTypeCommand,
  addBlockTypeCommand
} from '@milkdown/kit/preset/commonmark'
import { toggleUnderlineCommand } from '../plugins/underline-plugin'
import { toggleStrikethroughCommand } from '@milkdown/kit/preset/gfm'
import { TOOLBAR_ITEMS } from '../constants/toolbar-items'
import type { ToolbarItemDef } from '../constants/toolbar-items'
import styles from './EditorToolbar.module.css'

interface EditorToolbarProps {
  getEditor: () => Editor | undefined
  memoId: string
  opacity: number
  onOpacityChange: (opacity: number) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  toolbarItems: string[]
}

export default function EditorToolbar({
  getEditor,
  memoId,
  opacity,
  onOpacityChange,
  fontSize,
  onFontSizeChange,
  toolbarItems
}: EditorToolbarProps): React.JSX.Element {
  // B4: onMouseDown + preventDefault to prevent editor focus loss
  const preventBlur = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  // Sliders need default mouseDown for drag — refocus editor after interaction
  const allowSliderDrag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    // After slider drag ends, refocus the editor to keep toolbar visible
    const onUp = (): void => {
      document.removeEventListener('mouseup', onUp)
      // Refocus editor after a tick
      setTimeout(() => {
        const editor = document.querySelector('.milkdown [contenteditable]') as HTMLElement | null
        editor?.focus()
      }, 50)
    }
    document.addEventListener('mouseup', onUp)
  }, [])

  // Handler for each toolbar item
  const handleItemClick = useCallback(
    (e: React.MouseEvent, itemId: string) => {
      e.preventDefault()
      const editor = getEditor()
      if (!editor) return
      const view = editor.ctx.get(editorViewCtx)

      switch (itemId) {
        case 'bold':
          editor.action(callCommand(toggleStrongCommand.key))
          break
        case 'underline':
          editor.action(callCommand(toggleUnderlineCommand.key))
          break
        case 'italic':
          editor.action(callCommand(toggleEmphasisCommand.key))
          break
        case 'strikethrough':
          editor.action(callCommand(toggleStrikethroughCommand.key))
          break
        case 'h1':
        case 'h2':
        case 'h3': {
          const level = parseInt(itemId.slice(1), 10)
          const headingType = view.state.schema.nodes['heading']
          if (headingType) {
            editor.action(callCommand(setBlockTypeCommand.key, { nodeType: headingType, attrs: { level } }))
          }
          break
        }
        case 'checkbox': {
          const { schema, tr, selection } = view.state
          const listItemType = schema.nodes['list_item']
          const bulletListType = schema.nodes['bullet_list']
          if (!listItemType || !bulletListType) break

          const $pos = selection.$from
          for (let depth = $pos.depth; depth > 0; depth--) {
            const node = $pos.node(depth)
            if (node.type === listItemType) {
              const checked = node.attrs.checked
              if (checked === null || checked === undefined) {
                view.dispatch(tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: false }))
              } else {
                view.dispatch(tr.setNodeMarkup($pos.before(depth), undefined, { ...node.attrs, checked: !checked }))
              }
              return
            }
          }

          // Not in a list → wrap in bullet list first, then set checked
          editor.action(callCommand(wrapInBulletListCommand.key))
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
          break
        }
        case 'bullet':
          editor.action(callCommand(wrapInBulletListCommand.key))
          break
        case 'ordered':
          editor.action(callCommand(wrapInOrderedListCommand.key))
          break
        case 'quote':
          editor.action(callCommand(wrapInBlockquoteCommand.key))
          break
        case 'code': {
          const codeBlockType = view.state.schema.nodes['code_block']
          if (codeBlockType) {
            editor.action(callCommand(addBlockTypeCommand.key, { nodeType: codeBlockType }))
          }
          break
        }
        case 'hr':
          editor.action(callCommand(insertHrCommand.key))
          break
        case 'toggle': {
          const { schema } = view.state
          const detailsType = schema.nodes['details']
          const summaryType = schema.nodes['details_summary']
          if (detailsType && summaryType) {
            const summary = summaryType.create(null)
            const para = schema.nodes.paragraph.create(null)
            const details = detailsType.create({ open: true }, [summary, para])
            view.dispatch(view.state.tr.replaceSelectionWith(details))
          }
          break
        }
      }

      view.focus()
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

  // Resolve toolbar item definitions from IDs
  const itemDefsMap = useMemo(() => {
    const map = new Map<string, ToolbarItemDef>()
    for (const item of TOOLBAR_ITEMS) {
      map.set(item.id, item)
    }
    return map
  }, [])

  return (
    <div className={styles.toolbar} onMouseDown={preventBlur}>
      {toolbarItems.map((itemId) => {
        const def = itemDefsMap.get(itemId)
        if (!def) return null
        return (
          <button
            key={itemId}
            className={styles.btn}
            onMouseDown={(e) => handleItemClick(e, itemId)}
            title={def.title}
            style={def.style}
          >
            {def.icon}
          </button>
        )
      })}
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
