import { useEffect, useRef, useState } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react'
import { underlinePlugin } from '../plugins/underline-plugin'
import { useSlashCommand } from '../hooks/useSlashCommand'
import { useSlashExecute } from '../hooks/useSlashExecute'
import SlashDropdown from './SlashDropdown'
import './MemoEditor.css'

interface MemoEditorProps {
  initialContent: string
  onMarkdownChange?: (markdown: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onEditorReady?: (getEditor: () => Editor | undefined) => void
  fontSize?: number
}

function MilkdownEditor({
  initialContent,
  onMarkdownChange,
  onFocus,
  onBlur,
  onEditorReady,
  fontSize = 16
}: MemoEditorProps): React.JSX.Element {
  const onChangeRef = useRef(onMarkdownChange)
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onMarkdownChange
  onFocusRef.current = onFocus
  onBlurRef.current = onBlur

  const [editorReady, setEditorReady] = useState(false)

  const { get } = useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, initialContent)
        ctx.get(listenerCtx)
          .markdownUpdated((_ctx, markdown, prevMarkdown) => {
            if (markdown !== prevMarkdown) {
              onChangeRef.current?.(markdown)
            }
          })
          .focus(() => {
            onFocusRef.current?.()
          })
          .blur(() => {
            onBlurRef.current?.()
          })
          .mounted(() => {
            setEditorReady(true)
          })
      })
      .use(commonmark)
      .use(underlinePlugin)
      .use(history)
      .use(listener)
      .use(clipboard)
  }, [])

  // Slash command hooks — only after editor is ready
  const executeSlash = useSlashExecute(editorReady ? get : () => undefined)
  const { state: slashState, handleSelect: handleSlashSelect } = useSlashCommand(
    editorReady ? get : () => undefined,
    executeSlash
  )

  // Notify parent when editor is ready
  useEffect(() => {
    if (editorReady && onEditorReady) {
      onEditorReady(get)
    }
  }, [editorReady, get, onEditorReady])

  // Handle link clicks — open in external browser
  useEffect(() => {
    if (!editorReady) return
    const editor = get()
    if (!editor) return

    const view = editor.ctx.get(editorViewCtx)
    const dom = view.dom

    const handleClick = (e: Event): void => {
      const mouseEvent = e as MouseEvent
      const target = mouseEvent.target as HTMLElement
      const anchor = target.closest('a')
      if (anchor) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        const href = anchor.getAttribute('href')
        if (href) {
          window.api.openExternal(href)
        }
      }
    }

    dom.addEventListener('click', handleClick)
    return () => dom.removeEventListener('click', handleClick)
  }, [editorReady, get])

  // Apply font size
  useEffect(() => {
    if (!editorReady) return
    const editor = get()
    if (!editor) return
    const view = editor.ctx.get(editorViewCtx)
    view.dom.style.fontSize = `${fontSize}px`
  }, [fontSize, editorReady, get])

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Milkdown />
      {slashState.isOpen && (
        <SlashDropdown
          commands={slashState.commands}
          selectedIndex={slashState.selectedIndex}
          position={slashState.position}
          maxWidth={slashState.maxWidth}
          onSelect={handleSlashSelect}
        />
      )}
    </div>
  )
}

export default function MemoEditor(props: MemoEditorProps): React.JSX.Element {
  return (
    <MilkdownProvider>
      <MilkdownEditor {...props} />
    </MilkdownProvider>
  )
}
