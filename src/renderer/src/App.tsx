import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@milkdown/kit/core'
import type { AlarmData } from '../../shared/types'
import Titlebar from './components/Titlebar'
import MemoEditor from './components/MemoEditor'
import EditorToolbar from './components/EditorToolbar'
import { DEFAULT_COLOR, getEffectiveColor, isLightColor } from './constants/colors'

const DEFAULT_AUTO_SAVE_MS = 2000

const WEEKDAY_SHORT = ['일', '월', '화', '수', '목', '금', '토']

function formatAlarmSummary(alarm: AlarmData): string {
  const time = alarm.time
  switch (alarm.type) {
    case 'once':
      return `${alarm.date ?? ''} ${time}`
    case 'daily':
      return `매일 ${time}`
    case 'weekdays': {
      const days = (alarm.weekdays ?? []).sort().map((d) => WEEKDAY_SHORT[d]).join(', ')
      return `${days} ${time}`
    }
    case 'daterange':
      return `${alarm.startDate ?? ''} ~ ${alarm.endDate ?? ''} ${time}`
    default:
      return time
  }
}

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
  const [alarm, setAlarm] = useState<AlarmData | null>(null)
  const [alarmFiring, setAlarmFiring] = useState(false)
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
          setAlarm(data.frontmatter.alarm ?? null)
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

  // Prevent Electron default file-drop navigation
  useEffect(() => {
    const preventDrag = (e: DragEvent): void => {
      e.preventDefault()
    }
    document.addEventListener('dragover', preventDrag)
    document.addEventListener('drop', preventDrag)
    return () => {
      document.removeEventListener('dragover', preventDrag)
      document.removeEventListener('drop', preventDrag)
    }
  }, [])

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
    // Listen for alarm-fired event — visual feedback + sync alarm state
    window.api.onAlarmFired(() => {
      setAlarmFiring(true)
      setTimeout(() => setAlarmFiring(false), 5000)
      // Sync alarm state after auto-disable (e.g. once type)
      setTimeout(async () => {
        if (memoIdRef.current) {
          const updated = await window.api.getAlarm(memoIdRef.current)
          setAlarm(updated)
        }
      }, 1000)
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
      window.api.removeAllListeners('memo:alarm-fired')
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
              opacity: opacityRef.current,
              fontSize: fontSizeRef.current
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
    const markdown = currentContentRef.current
    if (!markdown.trim()) return
    try {
      await navigator.clipboard.writeText(markdown)
    } catch {
      // Fallback to IPC if navigator.clipboard fails
      await window.api.copyToClipboard(markdown)
    }
  }, [])

  // Alarm handlers
  const handleAlarmSave = useCallback(async (newAlarm: AlarmData) => {
    setAlarm(newAlarm)
    if (memoIdRef.current) {
      await window.api.setAlarm(memoIdRef.current, newAlarm)
    }
  }, [])

  const handleAlarmClear = useCallback(async () => {
    setAlarm(null)
    if (memoIdRef.current) {
      await window.api.clearAlarm(memoIdRef.current)
    }
  }, [])

  const handleEditorReady = useCallback((getEditor: () => Editor | undefined) => {
    getEditorRef.current = getEditor
  }, [])

  const handleEditorFocus = useCallback(() => {
    setEditorFocused(true)
  }, [])

  const toolbarInteractingRef = useRef(false)

  const handleToolbarInteractStart = useCallback(() => {
    toolbarInteractingRef.current = true
    // Catch mouseup anywhere (slider drag may leave toolbar bounds)
    const onUp = (): void => {
      toolbarInteractingRef.current = false
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mouseup', onUp)
  }, [])

  const handleToolbarInteractEnd = useCallback(() => {
    toolbarInteractingRef.current = false
  }, [])

  const handleEditorBlur = useCallback(() => {
    setTimeout(() => {
      // If toolbar is being interacted with (slider drag etc.), don't hide
      if (toolbarInteractingRef.current) return
      const toolbar = document.querySelector('[data-toolbar]')
      if (toolbar) {
        const active = document.activeElement
        if (toolbar.contains(active)) return
        if (toolbar.matches(':hover')) return
      }
      setEditorFocused(false)
    }, 150)
  }, [])

  // Compute effective background color for dark mode
  const effectiveColor = getEffectiveColor(color, isDark)
  // When background is dark but theme is light, force light text
  const forceDarkNote = !isDark && !isLightColor(effectiveColor)

  // Don't render editor until content is loaded
  if (initialContent === null && memoId) {
    return (
      <div data-note-dark={forceDarkNote || undefined} style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: effectiveColor, fontFamily: fontFamily || undefined }}>
        <Titlebar memoId={memoId} isRolledUp={isRolledUp} color={color} isDark={isDark} onColorChange={handleColorChange} onCopy={handleCopy} title={title} alarm={alarm} onAlarmSave={handleAlarmSave} onAlarmClear={handleAlarmClear} />
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
        fontFamily: fontFamily || undefined,
        boxShadow: alarmFiring ? 'inset 0 0 12px rgba(255, 100, 0, 0.6), 0 0 20px rgba(255, 100, 0, 0.4)' : undefined,
        animation: alarmFiring ? 'alarmGlow 1s ease-in-out infinite alternate' : undefined
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
        alarm={alarm}
        onAlarmSave={handleAlarmSave}
        onAlarmClear={handleAlarmClear}
      />
      {!isRolledUp && alarm?.enabled && (
        <div
          style={{
            padding: '3px 10px',
            fontSize: 14,
            color: alarmFiring ? '#fff' : 'var(--note-text-secondary)',
            background: alarmFiring ? 'rgba(255, 100, 0, 0.85)' : undefined,
            borderBottom: '1px solid var(--note-border)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'default',
            userSelect: 'none',
            transition: 'background 0.3s, color 0.3s'
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: alarmFiring ? 1 : 0.6 }}>
            <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-1.5 4-1.5 4h12s-1.5-1.5-1.5-4A4.5 4.5 0 008 1.5z" />
            <path d="M6.5 13a1.5 1.5 0 003 0" />
          </svg>
          {alarmFiring ? '알람!' : formatAlarmSummary(alarm)}
        </div>
      )}
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
              currentContent={currentContentRef.current}
            />
          </div>
          {editorFocused && (
            <div
              data-toolbar
              onMouseDown={handleToolbarInteractStart}
            >
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
