import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@milkdown/kit/core'
import Titlebar from './components/Titlebar'
import MemoEditor from './components/MemoEditor'
import EditorToolbar from './components/EditorToolbar'
import { DEFAULT_COLOR, getEffectiveColor, isLightColor } from './constants/colors'

const DEFAULT_AUTO_SAVE_MS = 2000

function App(): React.JSX.Element {
  const [memoId, setMemoId] = useState<string>('')
  const [isRolledUp, setIsRolledUp] = useState(false)
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [editorFocused, setEditorFocused] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const [initialContent, setInitialContent] = useState<string | null>(null)
  const [title, setTitle] = useState('새 메모')
  const [isDark, setIsDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [fontFamily, setFontFamily] = useState('')
  const [fontSize, setFontSize] = useState(16)
  const getEditorRef = useRef<() => Editor | undefined>(() => undefined)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingContentRef = useRef<string | null>(null)
  const currentContentRef = useRef<string>('')
  const memoIdRef = useRef<string>('')
  const autoSaveMsRef = useRef<number>(DEFAULT_AUTO_SAVE_MS)
  const colorRef = useRef(color)
  const opacityRef = useRef(opacity)
  const fontSizeRef = useRef(fontSize)
  colorRef.current = color
  opacityRef.current = opacity
  fontSizeRef.current = fontSize

  // Load memo data when memoId is set
  useEffect(() => {
    if (!memoId) return
    memoIdRef.current = memoId

    const loadMemo = async (): Promise<void> => {
      try {
        const data = await window.api.readMemo(memoId)
        if (data) {
          setColor(data.frontmatter.color || DEFAULT_COLOR)
          setOpacity(data.frontmatter.opacity ?? 1)
          setFontSize(data.frontmatter.fontSize || 16)
          setTitle(data.frontmatter.title || '새 메모')
          currentContentRef.current = data.content
          setInitialContent(data.content)
        } else {
          // New memo — no file yet
          currentContentRef.current = ''
          setInitialContent('')
        }
      } catch (e) {
        console.error('readMemo failed:', e)
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
    // D11: Fetch settings
    window.api.getSettings()
      .then((s) => {
        autoSaveMsRef.current = s.autoSaveSeconds * 1000
        if (s.fontFamily) setFontFamily(s.fontFamily)
      })
      .catch(() => { /* keep defaults */ })
    window.api.onRollupChanged((rolledUp) => {
      setIsRolledUp(rolledUp)
    })
    // B21: Flush pending save when window is closing
    window.api.onFlushSave(() => {
      flushSave()
    })
    // Sync isDark React state when main.tsx updates data-theme attribute
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      observer.disconnect()
      window.api.removeAllListeners('memo:init')
      window.api.removeAllListeners('memo:rollup-changed')
      window.api.removeAllListeners('memo:flush-save')
    }
  }, [])

  // Flush save immediately — uses refs to avoid stale closures (BUG-2 fix)
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const content = pendingContentRef.current
    const id = memoIdRef.current
    if (content !== null && id) {
      pendingContentRef.current = null
      try {
        // B20: Empty memo → delete file
        if (!content.trim()) {
          await window.api.deleteEmptyMemo(id)
          return
        }
        await window.api.saveMemo(id, content, { color: colorRef.current, opacity: opacityRef.current, fontSize: fontSizeRef.current })
      } catch (e) {
        console.error('flushSave failed:', e)
      }
    }
  }, [])

  // Auto-save with debounce — uses refs to avoid stale closures (BUG-3 fix)
  const handleMarkdownChange = useCallback(
    (markdown: string) => {
      pendingContentRef.current = markdown
      currentContentRef.current = markdown

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
          try {
            await window.api.saveMemo(memoIdRef.current, content, {
              color: colorRef.current,
              opacity: opacityRef.current
            })
          } catch (e) {
            console.error('autoSave failed:', e)
          }
        }
      }, autoSaveMsRef.current)
    },
    []
  )

  // Save color change immediately — uses currentContentRef to avoid data loss (BUG-1 fix)
  const handleColorChange = useCallback(
    (newColor: string) => {
      setColor(newColor)
      if (memoIdRef.current) {
        window.api.saveMemo(memoIdRef.current, currentContentRef.current, { color: newColor, opacity: opacityRef.current, fontSize: fontSizeRef.current })
          .catch((e) => console.error('color save failed:', e))
      }
    },
    []
  )

  // Save font size immediately
  const handleFontSizeChange = useCallback(
    (newSize: number) => {
      setFontSize(newSize)
      if (memoIdRef.current) {
        window.api.saveMemo(memoIdRef.current, currentContentRef.current, {
          color: colorRef.current, opacity: opacityRef.current, fontSize: newSize
        }).catch((e) => console.error('fontSize save failed:', e))
      }
    },
    []
  )

  // Copy memo content to clipboard
  const handleCopy = useCallback(async () => {
    const editor = getEditorRef.current()
    if (!editor) return
    const markdown = currentContentRef.current
    if (!markdown.trim()) return
    await window.api.copyToClipboard(markdown)
  }, [])

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

  // Compute effective background color for dark mode
  const effectiveColor = getEffectiveColor(color, isDark)
  // When background is dark but theme is light, force light text
  const forceDarkNote = !isDark && !isLightColor(effectiveColor)

  // Don't render editor until content is loaded
  if (initialContent === null && memoId) {
    return (
      <div data-note-dark={forceDarkNote || undefined} style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: effectiveColor, fontFamily: fontFamily || undefined }}>
        <Titlebar memoId={memoId} isRolledUp={isRolledUp} color={color} isDark={isDark} onColorChange={handleColorChange} onCopy={handleCopy} title={title} />
      </div>
    )
  }

  return (
    <div
      data-note-dark={forceDarkNote || undefined}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: effectiveColor,
        fontFamily: fontFamily || undefined
      }}
    >
      <Titlebar
        memoId={memoId}
        isRolledUp={isRolledUp}
        color={color}
        isDark={isDark}
        onColorChange={handleColorChange}
        onCopy={handleCopy}
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
              fontSize={fontSize}
            />
          </div>
          {editorFocused && (
            <div data-toolbar>
              <EditorToolbar
                getEditor={getEditorRef.current}
                memoId={memoId}
                opacity={opacity}
                onOpacityChange={setOpacity}
                fontSize={fontSize}
                onFontSizeChange={handleFontSizeChange}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
