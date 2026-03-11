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
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('modified')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null)

  // B7: Track IME composing state for search input
  const isComposingRef = useRef(false)
  const [committedQuery, setCommittedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load memos
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const list = await window.api.listMemos()
        setMemos(list)
      } catch (e) {
        console.error('listMemos failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
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

  const handleMemoClick = useCallback((memoId: string) => {
    setSelectedMemoId(memoId)
  }, [])

  const handleMemoDoubleClick = useCallback((memoId: string) => {
    window.api.openMemo(memoId)
      .catch((e) => console.error('openMemo failed:', e))
  }, [])

  const handleDelete = useCallback(async () => {
    if (!selectedMemoId) return
    if (!confirm('이 메모를 삭제하시겠습니까?')) return
    try {
      const ok = await window.api.deleteMemo(selectedMemoId)
      if (ok) {
        setMemos((prev) => prev.filter((m) => m.id !== selectedMemoId))
        setSelectedMemoId(null)
      }
    } catch (e) {
      console.error('deleteMemo failed:', e)
    }
  }, [selectedMemoId])

  const handleExport = useCallback(async () => {
    if (!selectedMemoId) return
    try {
      await window.api.exportMemo(selectedMemoId, false)
    } catch (e) {
      console.error('exportMemo failed:', e)
    }
  }, [selectedMemoId])

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
    <div className={styles.memoList}>
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
        <button className={styles.actionBtn} onClick={handleImport}>가져오기</button>
        <button
          className={styles.actionBtn}
          onClick={handleExport}
          disabled={!selectedMemoId}
        >
          내보내기
        </button>
        <button
          className={`${styles.actionBtn} ${styles.deleteBtn}`}
          onClick={handleDelete}
          disabled={!selectedMemoId}
        >
          삭제
        </button>
      </div>

      {/* Sort controls */}
      <div className={styles.sortBar}>
        <span className={styles.memoCount}>{filteredMemos.length}개 메모</span>
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
              className={`${styles.memoItem} ${selectedMemoId === memo.id ? styles.selected : ''}`}
              onClick={() => handleMemoClick(memo.id)}
              onDoubleClick={() => handleMemoDoubleClick(memo.id)}
            >
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
        // Normal click: select only this
        next.clear()
        next.add(memoId)
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

const FONT_PRESETS: Record<string, string> = {
  '기본': "Pretendard, '맑은 고딕', sans-serif",
  '코딩': 'D2Coding, monospace',
  '필기체': "'나눔손글씨 펜', '맑은 고딕', sans-serif",
  '고딕': "'Noto Sans KR', '맑은 고딕', sans-serif",
  '명조': "'Noto Serif KR', serif"
}

function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [pathError, setPathError] = useState<string | null>(null)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const s = await window.api.getSettings()
        setSettings(s)
      } catch (e) {
        console.error('getSettings failed:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // B27: Update setting immediately on change
  const updateSetting = useCallback(async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev)
    setPathError(null)

    try {
      const result = await window.api.updateSettings({ [key]: value })
      if (!result.success && result.error) {
        setPathError(result.error)
        // Revert on failure
        const fresh = await window.api.getSettings()
        setSettings(fresh)
      }
    } catch (e) {
      console.error('updateSettings failed:', e)
    }
  }, [])

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
      {/* Font preset */}
      <div className={styles.settingRow}>
        <label className={styles.settingLabel}>폰트</label>
        <select
          className={styles.settingSelect}
          value={settings.fontPreset}
          onChange={(e) => updateSetting('fontPreset', e.target.value)}
        >
          {Object.keys(FONT_PRESETS).map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
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
