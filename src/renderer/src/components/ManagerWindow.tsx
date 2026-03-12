import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MemoData, AppSettings } from '../../../shared/types'
import styles from './ManagerWindow.module.css'

type Tab = 'memos' | 'trash' | 'settings'
type SortBy = 'modified' | 'created' | 'title'
type SortOrder = 'asc' | 'desc'

const TAB_LABELS: Record<Tab, string> = {
  memos: '메모 목록',
  trash: '휴지통',
  settings: '설정'
}

const SORT_LABELS: Record<SortBy, string> = {
  modified: '수정일',
  created: '생성일',
  title: '제목'
}

function getInitialTab(): Tab {
  const hash = window.location.hash
  const match = hash.match(/tab=(\w+)/)
  if (match) {
    const t = match[1] as Tab
    if (t in TAB_LABELS) return t
  }
  return 'memos'
}

/** Format relative time (e.g. "3분 전", "2시간 전", "어제") */
function formatRelativeTime(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '방금 전'
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHour < 24) return `${diffHour}시간 전`
  if (diffDay === 1) return '어제'
  if (diffDay < 30) return `${diffDay}일 전`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}개월 전`
  return `${Math.floor(diffDay / 365)}년 전`
}

export default function ManagerWindow(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab)

  // Prevent Electron default file-drop navigation
  useEffect(() => {
    const prevent = (e: DragEvent): void => { e.preventDefault() }
    document.addEventListener('dragover', prevent)
    document.addEventListener('drop', prevent)
    return () => {
      document.removeEventListener('dragover', prevent)
      document.removeEventListener('drop', prevent)
    }
  }, [])

  useEffect(() => {
    window.api.onManagerSwitchTab((tab) => {
      if (tab in TAB_LABELS) {
        setActiveTab(tab as Tab)
      }
    })
    return () => {
      window.api.removeAllListeners('manager:switch-tab')
    }
  }, [])

  return (
    <div className={styles.container}>
      <div className={styles.managerTitlebar}>Sticky Memo</div>
      <div className={styles.tabs}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className={styles.content}>
        {activeTab === 'memos' && <MemoList />}
        {activeTab === 'trash' && <TrashList />}
        {activeTab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  )
}

function MemoList(): React.JSX.Element {
  const [memos, setMemos] = useState<MemoData[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('modified')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  // B7: Track IME composing state for search input
  const isComposingRef = useRef(false)
  const [committedQuery, setCommittedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track optimistically-added memo IDs (no file yet)
  const optimisticIdsRef = useRef<Set<string>>(new Set())

  // Load memos + periodic refresh (syncs title changes from memo windows)
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const list = await window.api.listMemos()
        // Preserve optimistic entries not yet on disk
        setMemos((prev) => {
          const diskIds = new Set(list.map((m) => m.id))
          const optimistic = prev.filter((m) => optimisticIdsRef.current.has(m.id) && !diskIds.has(m.id))
          // Remove from optimistic set if now on disk
          for (const id of optimisticIdsRef.current) {
            if (diskIds.has(id)) optimisticIdsRef.current.delete(id)
          }
          return [...optimistic, ...list]
        })
      } catch (e) {
        console.error('listMemos failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [])

  // Debounced search (B7: only trigger after compositionend)
  const handleSearchInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (!isComposingRef.current) {
        setCommittedQuery(value)
      }
    }, 300)
  }, [])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false
    const value = (e.target as HTMLInputElement).value
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setCommittedQuery(value)
    }, 300)
  }, [])

  // Filter + sort memos
  const filteredMemos = useMemo(() => {
    const query = committedQuery.toLowerCase().trim()
    let result = memos

    if (query) {
      result = memos.filter((m) => {
        const title = m.frontmatter.title.toLowerCase()
        const content = m.content.toLowerCase()
        return title.includes(query) || content.includes(query)
      })
    }

    // Sort (secondary sort by id for stability)
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'title') {
        cmp = a.frontmatter.title.localeCompare(b.frontmatter.title, 'ko')
      } else if (sortBy === 'created') {
        cmp = new Date(a.frontmatter.created).getTime() - new Date(b.frontmatter.created).getTime()
      } else {
        cmp = new Date(a.frontmatter.modified).getTime() - new Date(b.frontmatter.modified).getTime()
      }
      if (cmp === 0) cmp = a.id.localeCompare(b.id)
      return sortOrder === 'desc' ? -cmp : cmp
    })

    return sorted
  }, [memos, committedQuery, sortBy, sortOrder])

  const handleMemoClick = useCallback((memoId: string, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)

      if (e.shiftKey && lastClickedRef.current) {
        const ids = filteredMemos.map((m) => m.id)
        const startIdx = ids.indexOf(lastClickedRef.current)
        const endIdx = ids.indexOf(memoId)
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
          for (let i = from; i <= to; i++) {
            next.add(ids[i])
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        if (next.has(memoId)) next.delete(memoId)
        else next.add(memoId)
      } else {
        if (next.has(memoId)) next.delete(memoId)
        else next.add(memoId)
      }

      return next
    })
    lastClickedRef.current = memoId
  }, [filteredMemos])

  const handleMemoDoubleClick = useCallback((memoId: string) => {
    window.api.openMemo(memoId)
      .catch((e) => console.error('openMemo failed:', e))
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredMemos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredMemos.map((m) => m.id)))
    }
  }, [filteredMemos, selectedIds.size])

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!confirm(`${count}개 메모를 삭제하시겠습니까?`)) return
    const ids = [...selectedIds]
    const deleted = new Set<string>()
    for (const id of ids) {
      try {
        const ok = await window.api.deleteMemo(id)
        if (ok) deleted.add(id)
      } catch (e) {
        console.error('deleteMemo failed:', id, e)
      }
    }
    if (deleted.size > 0) {
      setMemos((prev) => prev.filter((m) => !deleted.has(m.id)))
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of deleted) next.delete(id)
        return next
      })
    }
  }, [selectedIds])

  const handleExport = useCallback(async () => {
    if (selectedIds.size === 0) return
    try {
      // Export first selected memo
      const firstId = [...selectedIds][0]
      await window.api.exportMemo(firstId, false)
    } catch (e) {
      console.error('exportMemo failed:', e)
    }
  }, [selectedIds])

  const handleNewMemo = useCallback(async () => {
    try {
      const newId = await window.api.createWindow()
      if (newId) {
        optimisticIdsRef.current.add(newId)
        setMemos((prev) => [{
          id: newId,
          frontmatter: {
            title: '새 메모',
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            color: '#FFF9B1',
            pinned: false,
            opacity: 1,
            fontSize: 16
          },
          content: ''
        }, ...prev])
      }
    } catch (e) {
      console.error('createWindow failed:', e)
    }
  }, [])

  const handleImport = useCallback(async () => {
    try {
      const imported = await window.api.importMemo()
      if (imported) {
        setMemos((prev) => [imported, ...prev])
      }
    } catch (e) {
      console.error('importMemo failed:', e)
    }
  }, [])

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
      const result = await window.api.importMemoFromPath(filePath)
      if ('error' in result) {
        if (result.error === 'too-large') {
          alert('파일이 너무 큽니다 (최대 500KB)')
        }
        return
      }
      setMemos((prev) => [result, ...prev])
    } catch (err) {
      console.error('drop import failed:', err)
    }
  }, [])

  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }, [])

  const handleSortByChange = useCallback((newSort: SortBy) => {
    setSortBy(newSort)
    setShowSortMenu(false)
  }, [])

  // Close sort menu on outside click
  useEffect(() => {
    if (!showSortMenu) return
    const handleClick = (): void => setShowSortMenu(false)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showSortMenu])

  if (loading) {
    return <div className={styles.placeholder}>로딩 중...</div>
  }

  return (
    <div
      className={styles.memoList}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragOver && (
        <div className={styles.dropOverlay}>
          <span>.md / .txt 파일을 놓아 가져오기</span>
        </div>
      )}
      {/* Search bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="메모 검색..."
          value={searchQuery}
          onChange={handleSearchInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
        />
      </div>

      {/* Action bar */}
      <div className={styles.actionBar}>
        <button className={styles.actionBtn} onClick={handleNewMemo}>새 메모</button>
        <button className={styles.actionBtn} onClick={handleImport}>가져오기</button>
        <button
          className={styles.actionBtn}
          onClick={handleExport}
          disabled={selectedIds.size !== 1}
          title={selectedIds.size > 1 ? '1개만 선택해주세요' : undefined}
        >
          내보내기
        </button>
        <button
          className={`${styles.actionBtn} ${styles.deleteBtn}`}
          onClick={handleDelete}
          disabled={selectedIds.size === 0}
        >
          삭제
        </button>
      </div>

      {/* Sort controls */}
      <div className={styles.sortBar}>
        <div className={styles.sortBarLeft}>
          {filteredMemos.length > 0 && (
            <label className={styles.selectAllCheckbox}>
              <input
                type="checkbox"
                checked={filteredMemos.length > 0 && selectedIds.size === filteredMemos.length}
                onChange={handleSelectAll}
              />
            </label>
          )}
          <span className={styles.memoCount}>
            {selectedIds.size > 0
              ? `${selectedIds.size}/${filteredMemos.length}개 선택`
              : `${filteredMemos.length}개 메모`}
          </span>
        </div>
        <div className={styles.sortControls}>
          <div className={styles.sortDropdownWrapper}>
            <button
              className={styles.sortBtn}
              onClick={(e) => { e.stopPropagation(); setShowSortMenu((v) => !v) }}
            >
              {SORT_LABELS[sortBy]}
            </button>
            {showSortMenu && (
              <div className={styles.sortMenu}>
                {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
                  <button
                    key={key}
                    className={`${styles.sortMenuItem} ${sortBy === key ? styles.sortActive : ''}`}
                    onClick={() => handleSortByChange(key)}
                  >
                    {SORT_LABELS[key]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={styles.sortOrderBtn} onClick={toggleSortOrder} title={sortOrder === 'desc' ? '내림차순' : '오름차순'}>
            {sortOrder === 'desc' ? '\u2193' : '\u2191'}
          </button>
        </div>
      </div>

      {/* Memo items */}
      {filteredMemos.length === 0 ? (
        <div className={styles.placeholder}>
          {committedQuery ? '검색 결과가 없습니다.' : '메모가 없습니다.'}
        </div>
      ) : (
        <div className={styles.memoItems}>
          {filteredMemos.map((memo) => (
            <div
              key={memo.id}
              className={`${styles.memoItem} ${selectedIds.has(memo.id) ? styles.selected : ''}`}
              onClick={(e) => handleMemoClick(memo.id, e)}
              onDoubleClick={() => handleMemoDoubleClick(memo.id)}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(memo.id)}
                onChange={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(memo.id)) next.delete(memo.id)
                    else next.add(memo.id)
                    return next
                  })
                }}
                onClick={(e) => e.stopPropagation()}
                className={styles.itemCheckbox}
              />
              <span
                className={styles.colorDot}
                style={{ backgroundColor: memo.frontmatter.color }}
              />
              {memo.frontmatter.alarms && memo.frontmatter.alarms.length > 0 && (
                <span className={styles.alarmBadge} title={`알람 ${memo.frontmatter.alarms.length}개`}>
                  🔔{memo.frontmatter.alarms.length > 1 ? memo.frontmatter.alarms.length : ''}
                </span>
              )}
              <span className={styles.memoTitle}>{memo.frontmatter.title}</span>
              <span className={styles.memoTime}>
                {formatRelativeTime(memo.frontmatter.modified)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrashList(): React.JSX.Element {
  const [trashMemos, setTrashMemos] = useState<MemoData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const list = await window.api.listTrash()
        setTrashMemos(list)
      } catch (e) {
        console.error('listTrash failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleItemClick = useCallback((memoId: string, e: React.MouseEvent) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)

      if (e.shiftKey && lastClickedRef.current) {
        // Shift+click: range select
        const ids = trashMemos.map((m) => m.id)
        const startIdx = ids.indexOf(lastClickedRef.current)
        const endIdx = ids.indexOf(memoId)
        if (startIdx !== -1 && endIdx !== -1) {
          const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
          for (let i = from; i <= to; i++) {
            next.add(ids[i])
          }
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl+click: toggle single
        if (next.has(memoId)) {
          next.delete(memoId)
        } else {
          next.add(memoId)
        }
      } else {
        // Normal click: toggle
        if (next.has(memoId)) next.delete(memoId)
        else next.add(memoId)
      }

      return next
    })
    lastClickedRef.current = memoId
  }, [trashMemos])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === trashMemos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(trashMemos.map((m) => m.id)))
    }
  }, [trashMemos, selectedIds.size])

  const handleRestore = useCallback(async () => {
    if (selectedIds.size === 0) return
    const ids = [...selectedIds]
    try {
      for (const id of ids) {
        await window.api.restoreMemo(id)
      }
      setTrashMemos((prev) => prev.filter((m) => !selectedIds.has(m.id)))
      setSelectedIds(new Set())
    } catch (e) {
      console.error('restoreMemo failed:', e)
    }
  }, [selectedIds])

  const handleDeletePermanent = useCallback(async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    if (!confirm(`${count}개 메모를 영구 삭제하시겠습니까? 복구할 수 없습니다.`)) return
    const ids = [...selectedIds]
    try {
      for (const id of ids) {
        await window.api.deletePermanent(id)
      }
      setTrashMemos((prev) => prev.filter((m) => !selectedIds.has(m.id)))
      setSelectedIds(new Set())
    } catch (e) {
      console.error('deletePermanent failed:', e)
    }
  }, [selectedIds])

  if (loading) {
    return <div className={styles.placeholder}>로딩 중...</div>
  }

  const allSelected = trashMemos.length > 0 && selectedIds.size === trashMemos.length

  return (
    <div className={styles.memoList}>
      <div className={styles.trashActionBar}>
        <div className={styles.trashActionLeft}>
          {trashMemos.length > 0 && (
            <label className={styles.selectAllCheckbox}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
              />
              <span>전체 선택 ({selectedIds.size}/{trashMemos.length})</span>
            </label>
          )}
        </div>
        <div className={styles.trashActionRight}>
          <button
            className={styles.actionBtn}
            onClick={handleRestore}
            disabled={selectedIds.size === 0}
          >
            복원
          </button>
          <button
            className={`${styles.actionBtn} ${styles.deleteBtn}`}
            onClick={handleDeletePermanent}
            disabled={selectedIds.size === 0}
          >
            영구 삭제
          </button>
        </div>
      </div>

      {trashMemos.length === 0 ? (
        <div className={styles.placeholder}>휴지통이 비어 있습니다.</div>
      ) : (
        <div className={styles.memoItems}>
          {trashMemos.map((memo) => (
            <div
              key={memo.id}
              className={`${styles.memoItem} ${selectedIds.has(memo.id) ? styles.selected : ''}`}
              onClick={(e) => handleItemClick(memo.id, e)}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(memo.id)}
                onChange={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev)
                    if (next.has(memo.id)) next.delete(memo.id)
                    else next.add(memo.id)
                    return next
                  })
                }}
                onClick={(e) => e.stopPropagation()}
                className={styles.itemCheckbox}
              />
              <span
                className={styles.colorDot}
                style={{ backgroundColor: memo.frontmatter.color }}
              />
              <span className={styles.memoTitle}>{memo.frontmatter.title}</span>
              <span className={styles.memoTime}>
                {formatRelativeTime(memo.frontmatter.modified)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [pathError, setPathError] = useState<string | null>(null)
  const [hotkeyError, setHotkeyError] = useState<string | null>(null)
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [fontSearch, setFontSearch] = useState('')
  const [showFontDropdown, setShowFontDropdown] = useState(false)
  const fontDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const [s, fonts] = await Promise.all([
          window.api.getSettings(),
          window.api.listFonts()
        ])
        setSettings(s)
        setSystemFonts(fonts)
      } catch (e) {
        console.error('getSettings failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Close font dropdown on outside click
  useEffect(() => {
    if (!showFontDropdown) return
    const handleClick = (e: MouseEvent): void => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(e.target as Node)) {
        setShowFontDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFontDropdown])

  // B27: Update setting immediately on change
  const updateSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
    setPathError(null)
    setHotkeyError(null)

    try {
      const result = await window.api.updateSettings({ [key]: value })
      if (!result.success && result.error) {
        if (key === 'globalHotkey') {
          setHotkeyError(result.error)
        } else {
          setPathError(result.error)
        }
        // Revert on failure
        const fresh = await window.api.getSettings()
        setSettings(fresh)
      }
    } catch (e) {
      console.error('updateSettings failed:', e)
    }
  }, [])

  // Hotkey recorder: capture key combo on keydown
  const handleHotkeyKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Ignore lone modifier keys
    const key = e.key
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')

    // Need at least one modifier
    if (parts.length === 0) return

    // Map special keys to Electron accelerator names
    const keyMap: Record<string, string> = {
      ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down',
      ArrowLeft: 'Left', ArrowRight: 'Right',
      Delete: 'Delete', Backspace: 'Backspace',
      Enter: 'Enter', Escape: 'Escape', Tab: 'Tab'
    }
    const mappedKey = keyMap[key] || (key.length === 1 ? key.toUpperCase() : key)
    parts.push(mappedKey)

    const accelerator = parts.join('+')
    setRecordingHotkey(false)
    updateSetting('globalHotkey', accelerator)
  }, [updateSetting])

  const handleSelectDirectory = useCallback(async () => {
    try {
      const dir = await window.api.selectDirectory()
      if (dir) {
        updateSetting('savePath', dir)
      }
    } catch (e) {
      console.error('selectDirectory failed:', e)
    }
  }, [updateSetting])

  const handleBackup = useCallback(async () => {
    try {
      await window.api.backup()
    } catch (e) {
      console.error('backup failed:', e)
    }
  }, [])

  const handleRestore = useCallback(async () => {
    try {
      await window.api.restore()
    } catch (e) {
      console.error('restore failed:', e)
    }
  }, [])

  if (loading || !settings) {
    return <div className={styles.placeholder}>로딩 중...</div>
  }

  return (
    <div className={styles.settingsPanel}>
      {/* Font family */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>폰트</label>
        <div className={styles.fontPicker} ref={fontDropdownRef}>
          <input
            type="text"
            className={styles.fontSearchInput}
            value={showFontDropdown ? fontSearch : settings.fontFamily}
            placeholder="폰트 검색..."
            onFocus={() => { setShowFontDropdown(true); setFontSearch('') }}
            onChange={(e) => setFontSearch(e.target.value)}
          />
          <span className={styles.fontPreview} style={{ fontFamily: settings.fontFamily }}>
            가나다 ABC 123
          </span>
          {showFontDropdown && (() => {
            const query = fontSearch.toLowerCase()
            const filtered = systemFonts.filter((f) => f.toLowerCase().includes(query))
            const favorites = settings.favoriteFonts || []
            const favs = filtered.filter((f) => favorites.includes(f))
            const rest = filtered.filter((f) => !favorites.includes(f))
            const toggleFav = (font: string, e: React.MouseEvent): void => {
              e.stopPropagation()
              const current = favorites
              const next = current.includes(font)
                ? current.filter((f) => f !== font)
                : [...current, font]
              updateSetting('favoriteFonts', next)
            }
            const renderItem = (font: string): React.JSX.Element => (
              <button
                key={font}
                className={`${styles.fontItem} ${settings.fontFamily === font ? styles.fontItemActive : ''}`}
                style={{ fontFamily: font }}
                onClick={() => {
                  updateSetting('fontFamily', font)
                  setShowFontDropdown(false)
                }}
              >
                <span className={styles.fontItemName}>{font}</span>
                <span
                  className={styles.fontFavBtn}
                  onClick={(e) => toggleFav(font, e)}
                  title={favorites.includes(font) ? '즐겨찾기 해제' : '즐겨찾기'}
                >
                  {favorites.includes(font) ? '★' : '☆'}
                </span>
              </button>
            )
            return (
              <div className={styles.fontDropdown}>
                {favs.length > 0 && (
                  <>
                    <div className={styles.fontSectionLabel}>즐겨찾기</div>
                    {favs.map(renderItem)}
                    <div className={styles.fontDivider} />
                  </>
                )}
                {rest.map(renderItem)}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Dark mode */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>테마</label>
        <select
          className={styles.settingSelect}
          value={settings.darkMode}
          onChange={(e) => updateSetting('darkMode', e.target.value as 'system' | 'light' | 'dark')}
        >
          <option value="system">시스템 설정 따르기</option>
          <option value="light">라이트</option>
          <option value="dark">다크</option>
        </select>
      </div>

      {/* Titlebar style */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>제목 줄 크기</label>
        <select
          className={styles.settingSelect}
          value={settings.titlebarStyle}
          onChange={(e) => updateSetting('titlebarStyle', e.target.value as 'compact' | 'default' | 'spacious')}
        >
          <option value="compact">컴팩트 (28px)</option>
          <option value="default">기본 (36px)</option>
          <option value="spacious">넓게 (44px)</option>
        </select>
      </div>

      {/* Auto save seconds */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>자동 저장 주기</label>
        <div className={styles.settingInputGroup}>
          <input
            type="number"
            className={styles.settingInput}
            value={settings.autoSaveSeconds}
            min={1}
            max={5}
            onChange={(e) => {
              const v = Math.max(1, Math.min(5, Number(e.target.value) || 1))
              updateSetting('autoSaveSeconds', v)
            }}
          />
          <span className={styles.settingUnit}>초</span>
        </div>
      </div>

      {/* Trash days */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>휴지통 자동 비우기</label>
        <div className={styles.settingInputGroup}>
          <input
            type="number"
            className={styles.settingInput}
            value={settings.trashDays}
            min={1}
            max={365}
            onChange={(e) => {
              const v = Math.max(1, Math.min(365, Number(e.target.value) || 30))
              updateSetting('trashDays', v)
            }}
          />
          <span className={styles.settingUnit}>일</span>
        </div>
      </div>

      {/* Save path */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>저장 경로</label>
        <div className={styles.settingPathGroup}>
          <input
            type="text"
            className={`${styles.settingPathInput} ${pathError ? styles.settingError : ''}`}
            value={settings.savePath}
            onChange={(e) => updateSetting('savePath', e.target.value)}
          />
          <button className={styles.settingPathBtn} onClick={handleSelectDirectory}>...</button>
        </div>
        {pathError && <div className={styles.settingErrorText}>{pathError}</div>}
      </div>

      {/* Max open windows */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>동시 오픈 제한</label>
        <div className={styles.settingInputGroup}>
          <input
            type="number"
            className={styles.settingInput}
            value={settings.maxOpenWindows}
            min={1}
            max={30}
            onChange={(e) => {
              const v = Math.max(1, Math.min(30, Number(e.target.value) || 10))
              updateSetting('maxOpenWindows', v)
            }}
          />
          <span className={styles.settingUnit}>개</span>
        </div>
      </div>

      {/* Auto start */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>자동 시작</label>
        <label className={styles.settingCheckbox}>
          <input
            type="checkbox"
            checked={settings.autoStart}
            onChange={(e) => updateSetting('autoStart', e.target.checked)}
          />
          <span>Windows 시작 시 자동 실행</span>
        </label>
      </div>

      {/* Global hotkey */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>글로벌 단축키</label>
        <div className={styles.settingInputGroup}>
          <input
            type="text"
            className={styles.settingSelect}
            value={recordingHotkey ? '키 조합을 누르세요...' : (settings.globalHotkey || '없음')}
            readOnly
            onFocus={() => setRecordingHotkey(true)}
            onBlur={() => setRecordingHotkey(false)}
            onKeyDown={handleHotkeyKeyDown}
            style={{ cursor: 'pointer', caretColor: 'transparent' }}
          />
          {settings.globalHotkey && (
            <button
              className={styles.actionBtn}
              onClick={() => updateSetting('globalHotkey', '')}
              title="단축키 해제"
              style={{ padding: '4px 8px', fontSize: 12 }}
            >
              해제
            </button>
          )}
        </div>
        {hotkeyError && <div className={styles.settingErrorText}>{hotkeyError}</div>}
      </div>

      {/* Backup / Restore */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>백업 / 복원</label>
        <div className={styles.settingBtnGroup}>
          <button className={styles.actionBtn} onClick={handleBackup}>백업</button>
          <button className={styles.actionBtn} onClick={handleRestore}>복원</button>
        </div>
      </div>
    </div>
  )
}
