import { useEffect, useRef, useState, useCallback } from 'react'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { replaceAll } from '@milkdown/kit/utils'
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
  currentContent?: string
}

function MilkdownEditor({
  initialContent,
  onMarkdownChange,
  onFocus,
  onBlur,
  onEditorReady,
  fontSize = 16,
  currentContent = ''
}: MemoEditorProps): React.JSX.Element {
  const onChangeRef = useRef(onMarkdownChange)
  const onFocusRef = useRef(onFocus)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onMarkdownChange
  onFocusRef.current = onFocus
  onBlurRef.current = onBlur

  const [editorReady, setEditorReady] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const currentContentRef = useRef(currentContent)
  currentContentRef.current = currentContent

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
      .use(gfm)
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

  // Notify parent when editor is ready + auto-focus
  useEffect(() => {
    if (!editorReady) return
    if (onEditorReady) {
      onEditorReady(get)
    }
    // Auto-focus so user can start typing immediately
    const editor = get()
    if (editor) {
      const view = editor.ctx.get(editorViewCtx)
      view.focus()
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

      // Handle link clicks
      const anchor = target.closest('a')
      if (anchor) {
        mouseEvent.preventDefault()
        mouseEvent.stopPropagation()
        const href = anchor.getAttribute('href')
        if (href) {
          window.api.openExternal(href)
        }
        return
      }

      // Handle task list checkbox clicks
      const li = target.closest('li[data-checked]') as HTMLElement | null
      if (li && mouseEvent.offsetX < 24) {
        mouseEvent.preventDefault()
        const pos = view.posAtDOM(li, 0)
        const resolved = view.state.doc.resolve(pos)
        // Walk up to find the list_item node
        for (let d = resolved.depth; d >= 0; d--) {
          const node = resolved.node(d)
          if (node.type.name === 'list_item' && node.attrs.checked !== undefined) {
            const before = resolved.before(d)
            view.dispatch(
              view.state.tr.setNodeMarkup(before, undefined, { ...node.attrs, checked: !node.attrs.checked })
            )
            break
          }
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

  // Drag-and-drop file import (dragenter/dragleave counter to prevent flicker)
  const dragCounterRef = useRef(0)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setDragOver(false)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const file = files[0]
    const filePath = window.api.getPathForFile(file)
    if (!filePath) return

    const ext = filePath.split('.').pop()?.toLowerCase()
    if (ext !== 'md' && ext !== 'txt') return

    try {
      const result = await window.api.readExternalFile(filePath)
      if ('error' in result) {
        if (result.error === 'too-large') {
          alert('파일이 너무 큽니다 (최대 500KB)')
        }
        return
      }

      // Confirm overwrite if current memo has content
      if (currentContentRef.current.trim()) {
        if (!confirm('현재 메모 내용을 덮어쓰시겠습니까?')) return
      }

      const editor = get()
      if (editor) {
        editor.action(replaceAll(result.content))
      }
    } catch (err) {
      console.error('drop import failed:', err)
    }
  }, [get])

  return (
    <div
      style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
      {dragOver && (
        <div className="drag-overlay">
          <span>파일을 여기에 놓으세요</span>
        </div>
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
