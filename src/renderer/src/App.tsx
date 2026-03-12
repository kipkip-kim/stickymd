import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@milkdown/kit/core'
import type { AlarmData } from '../../shared/types'
import Titlebar from './components/Titlebar'
import MemoEditor from './components/MemoEditor'
import EditorToolbar from './components/EditorToolbar'
import { DEFAULT_COLOR, getEffectiveColor, isLightColor } from './constants/colors'

const DEFAULT_AUTO_SAVE_MS = 2000

/** Play a pleasant alarm chime using Web Audio API */
async function playAlarmSound(): Promise<void> {
  try {
    const ctx = new AudioContext()
    // Resume if suspended (Electron autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const now = ctx.currentTime

    // Two-tone chime: play twice
    const notes = [
      { freq: 880, time: 0, duration: 0.15 },
      { freq: 1100, time: 0.18, duration: 0.2 },
      { freq: 880, time: 0.6, duration: 0.15 },
      { freq: 1100, time: 0.78, duration: 0.2 }
    ]

    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = note.freq
      gain.gain.setValueAtTime(0.3, now + note.time)
      gain.gain.exponentialRampToValueAtTime(0.01, now + note.time + note.duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + note.time)
      osc.stop(now + note.time + note.duration)
    }

    // Close context after playback
    setTimeout(() => ctx.close(), 2000)
  } catch {
    // Audio not available — skip silently
  }
}

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
  const [alarms, setAlarms] = useState<AlarmData[]>([])
  const [alarmFiring, setAlarmFiring] = useState(false)
  const [titlebarStyle, setTitlebarStyle] = useState<'compact' | 'default' | 'spacious'>('default')
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
          setAlarms(data.frontmatter.alarms ?? [])
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
        if (s.titlebarStyle) setTitlebarStyle(s.titlebarStyle)
      })
      .catch(() => { /* keep defaults */ })
    // Listen for settings changes (e.g. titlebarStyle)
    window.api.onSettingsChanged((updates) => {
      if (updates.titlebarStyle) setTitlebarStyle(updates.titlebarStyle)
    })
    window.api.onRollupChanged((rolledUp) => {
      setIsRolledUp(rolledUp)
    })
    // B21: Flush pending save when window is closing
    window.api.onFlushSave(() => {
      flushSave()
    })
    // Listen for alarm-fired event — visual feedback + sound + sync alarm state
    window.api.onAlarmFired(() => {
      setAlarmFiring(true)
      playAlarmSound()
      setTimeout(() => setAlarmFiring(false), 5000)
      // Sync alarm state after auto-delete (e.g. once type removed from array)
      setTimeout(async () => {
        if (memoIdRef.current) {
          const updated = await window.api.getAlarms(memoIdRef.current)
          setAlarms(updated)
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
      window.api.removeAllListeners('settings:changed')
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

  // Ctrl+Wheel font size adjustment (FR-01)
  useEffect(() => {
    const handleWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const delta = e.deltaY < 0 ? 1 : -1
      const newSize = Math.max(10, Math.min(28, fontSizeRef.current + delta))
      if (newSize !== fontSizeRef.current) {
        handleFontSizeChange(newSize)
      }
    }
    document.addEventListener('wheel', handleWheel, { passive: false })
    return () => document.removeEventListener('wheel', handleWheel)
  }, [handleFontSizeChange])

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

  // Alarm handlers (multi-alarm)
  const handleAlarmAdd = useCallback(async (newAlarm: AlarmData) => {
    if (memoIdRef.current) {
      await window.api.addAlarm(memoIdRef.current, newAlarm)
      const updated = await window.api.getAlarms(memoIdRef.current)
      setAlarms(updated)
    }
  }, [])

  const handleAlarmRemove = useCallback(async (index: number) => {
    if (memoIdRef.current) {
      await window.api.removeAlarm(memoIdRef.current, index)
      const updated = await window.api.getAlarms(memoIdRef.current)
      setAlarms(updated)
    }
  }, [])

  const handleAlarmClearAll = useCallback(async () => {
    setAlarms([])
    if (memoIdRef.current) {
      await window.api.clearAlarms(memoIdRef.current)
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
        <Titlebar memoId={memoId} isRolledUp={isRolledUp} color={color} isDark={isDark} onColorChange={handleColorChange} onCopy={handleCopy} title={title} alarms={alarms} onAlarmAdd={handleAlarmAdd} onAlarmClearAll={handleAlarmClearAll} titlebarStyle={titlebarStyle} />
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
        alarms={alarms}
        onAlarmAdd={handleAlarmAdd}
        onAlarmClearAll={handleAlarmClearAll}
        titlebarStyle={titlebarStyle}
      />
      {!isRolledUp && alarms.length > 0 && (
        <div
          style={{
            borderBottom: '1px solid var(--note-border)',
            flexShrink: 0,
            cursor: 'default',
            userSelect: 'none'
          }}
        >
          {alarms.map((a, i) => (
            <div
              key={i}
              style={{
                padding: '2px 10px',
                fontSize: 14,
                color: alarmFiring ? '#fff' : 'var(--note-text-secondary)',
                background: alarmFiring ? 'rgba(255, 100, 0, 0.85)' : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'background 0.3s, color 0.3s'
              }}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: alarmFiring ? 1 : 0.6, flexShrink: 0 }}>
                <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5c0 2.5-1.5 4-1.5 4h12s-1.5-1.5-1.5-4A4.5 4.5 0 008 1.5z" />
                <path d="M6.5 13a1.5 1.5 0 003 0" />
              </svg>
              <span style={{ flex: 1 }}>{alarmFiring ? '알람!' : formatAlarmSummary(a)}</span>
              <button
                onClick={() => handleAlarmRemove(i)}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--note-text-secondary)',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: 14,
                  lineHeight: 1,
                  opacity: 0.6,
                  flexShrink: 0
                }}
                title="알람 삭제"
              >
                ×
              </button>
            </div>
          ))}
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
