import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { MemoData } from '../../../shared/types'
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
        {activeTab === 'trash' && <div className={styles.placeholder}>휴지통 (Phase 10b)</div>}
        {activeTab === 'settings' && <div className={styles.placeholder}>설정 (Phase 11)</div>}
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

    // Sort
    const sorted = [...result].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'title') {
        cmp = a.frontmatter.title.localeCompare(b.frontmatter.title, 'ko')
      } else if (sortBy === 'created') {
        cmp = new Date(a.frontmatter.created).getTime() - new Date(b.frontmatter.created).getTime()
      } else {
        cmp = new Date(a.frontmatter.modified).getTime() - new Date(b.frontmatter.modified).getTime()
      }
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
