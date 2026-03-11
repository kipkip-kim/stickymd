import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@milkdown/kit/core'
import Titlebar from './components/Titlebar'
import MemoEditor from './components/MemoEditor'
import EditorToolbar from './components/EditorToolbar'
import { DEFAULT_COLOR } from './constants/colors'

const AUTO_SAVE_MS = 2000 // Default 2 seconds

interface MemoData {
  id: string
  frontmatter: {
    title: string
    color: string
    opacity: number
    fontSize: number
    [key: string]: unknown
  }
  content: string
}

function App(): React.JSX.Element {
  const [memoId, setMemoId] = useState<string>('')
  const [isRolledUp, setIsRolledUp] = useState(false)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [editorFocused, setEditorFocused] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const [initialContent, setInitialContent] = useState<string | null>(null)
  const [title, setTitle] = useState('새 메모')
  const getEditorRef = useRef<() => Editor | undefined>(() => undefined)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const memoIdRef = useRef<string>('')

  // Load memo data when memoId is set
  useEffect(() => {
    if (!memoId) return
    memoIdRef.current = memoId

    const loadMemo = async (): Promise<void> => {
      const data = (await window.api.readMemo(memoId)) as MemoData | null
      if (data) {
        setColor(data.frontmatter.color || DEFAULT_COLOR)
        setOpacity(data.frontmatter.opacity ?? 1)
        setTitle(data.frontmatter.title || '새 메모')
        setInitialContent(data.content)
      } else {
        // New memo — no file yet
        setInitialContent('')
      }
    }
    loadMemo()
  }, [memoId])

  // Init + rollup events
  useEffect(() => {
    window.api.onMemoInit((data) => {
      setMemoId(data.memoId)
      setIsRolledUp(data.isRolledUp)
    })
    window.api.onRollupChanged((rolledUp) => {
      setIsRolledUp(rolledUp)
    })
    // B21: Flush pending save when window is closing
    window.api.onFlushSave(() => {
      flushSave()
    })
    return () => {
      window.api.removeAllListeners('memo:init')
      window.api.removeAllListeners('memo:rollup-changed')
      window.api.removeAllListeners('memo:flush-save')
    }
  }, [])

  // Flush save immediately
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const content = pendingContentRef.current
    const id = memoIdRef.current
    if (content !== null && id) {
      pendingContentRef.current = null
      // B20: Empty memo → delete file
      if (!content.trim()) {
        await window.api.deleteEmptyMemo(id)
        return
      }
      await window.api.saveMemo(id, content, { color, opacity })
    }
  }, [color, opacity])

  // Auto-save with debounce
  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      pendingContentRef.current = markdown

      // Extract title from first line
      const firstLine = markdown.split('\n').find((l) => l.trim())
      const newTitle = firstLine
        ? firstLine.replace(/^#{1,6}\s+/, '').replace(/\*{1,3}(.*?)\*{1,3}/g, '$1').trim() || '새 메모'
        : '새 메모'
      setTitle(newTitle)

      // Debounced save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null
        const content = pendingContentRef.current
        if (content !== null && memoIdRef.current) {
          pendingContentRef.current = null
          if (!content.trim()) {
            // Don't save empty memos yet — only delete on close (B20)
            return
          }
          await window.api.saveMemo(memoIdRef.current, content, { color, opacity })
        }
      }, AUTO_SAVE_MS)
    },
    [color, opacity]
  )

  // Save color change immediately
  const handleColorChange = useCallback(
    (newColor: string) => {
      setColor(newColor)
      if (memoIdRef.current) {
        window.api.saveMemo(memoIdRef.current, pendingContentRef.current || '', { color: newColor })
      }
    },
    []
  )

  const handleEditorReady = useCallback((getEditor: () => Editor | undefined) => {
    getEditorRef.current = getEditor
  }, [])

  const handleEditorFocus = useCallback(() => {
    setEditorFocused(true)
  }, [])

  const handleEditorBlur = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement
      const toolbar = document.querySelector('[data-toolbar]')
      if (toolbar && toolbar.contains(active)) return
      setEditorFocused(false)
    }, 100)
  }, [])

  const handleToggleUnderline = useCallback(() => {
    // Placeholder for custom ProseMirror underline mark
  }, [])

  const handleToggleCheckbox = useCallback(() => {
    // Placeholder for checkbox toggle
  }, [])

  // Don't render editor until content is loaded
  if (initialContent === null && memoId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: color }}>
        <Titlebar memoId={memoId} isRolledUp={isRolledUp} color={color} onColorChange={handleColorChange} title={title} />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: color
      }}
    >
      <Titlebar
        memoId={memoId}
        isRolledUp={isRolledUp}
        color={color}
        onColorChange={handleColorChange}
        title={title}
      />
      {!isRolledUp && (
        <>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <MemoEditor
              initialContent={initialContent ?? ''}
              onMarkdownChange={handleMarkdownChange}
              onFocus={handleEditorFocus}
              onBlur={handleEditorBlur}
              onEditorReady={handleEditorReady}
            />
          </div>
          {editorFocused && (
            <div data-toolbar>
              <EditorToolbar
                getEditor={getEditorRef.current}
                memoId={memoId}
                opacity={opacity}
                onOpacityChange={setOpacity}
                onToggleUnderline={handleToggleUnderline}
                onToggleCheckbox={handleToggleCheckbox}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
