import { useState, useEffect, useRef, useCallback } from 'react'

function getSearchMemoId(): string {
  const hash = window.location.hash
  const match = hash.match(/memoId=([^&]+)/)
  return match ? match[1] : ''
}

export default function SearchWindow(): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const memoId = useRef(getSearchMemoId()).current
  const isComposingRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()

    window.api.onSearchResult((c, idx) => {
      setCount(c)
      setActiveIndex(idx)
    })

    return () => {
      window.api.removeAllListeners('search:result')
    }
  }, [])

  const dispatchSearch = useCallback((value: string) => {
    if (memoId) {
      window.api.sendSearchQuery(memoId, value)
    }
  }, [memoId])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (!isComposingRef.current) {
      dispatchSearch(value)
    }
  }, [dispatchSearch])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false
    dispatchSearch((e.target as HTMLInputElement).value)
  }, [dispatchSearch])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      window.close()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (memoId) {
        window.api.sendSearchNavigate(memoId, e.shiftKey ? 'prev' : 'next')
      }
    }
  }, [memoId])

  const handleNavigate = useCallback((direction: 'next' | 'prev') => {
    if (memoId) {
      window.api.sendSearchNavigate(memoId, direction)
    }
  }, [memoId])

  const matchText = query
    ? count > 0 ? `${activeIndex + 1}/${count}` : '0'
    : ''

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      height: '100vh',
      padding: '0 4px 0 6px',
      gap: 2,
      backgroundColor: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13,
      borderRadius: 8,
      border: '1px solid var(--border-primary)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      boxSizing: 'border-box'
    }}>
      {/* Input with match count inside */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: 'var(--bg-secondary)',
        borderRadius: 4,
        padding: '0 6px',
        minWidth: 0,
        border: '1px solid transparent'
      }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="검색"
          autoFocus
          style={{
            flex: 1,
            border: 'none',
            padding: '5px 0',
            fontSize: 13,
            outline: 'none',
            backgroundColor: 'transparent',
            color: 'var(--text-primary)',
            minWidth: 0
          }}
        />
        {matchText && (
          <span style={{
            fontSize: 11,
            color: count > 0 ? 'var(--text-muted)' : '#e53935',
            whiteSpace: 'nowrap',
            marginLeft: 4,
            flexShrink: 0
          }}>
            {matchText}
          </span>
        )}
      </div>

      {/* Navigation buttons */}
      <button
        onClick={() => handleNavigate('prev')}
        disabled={count === 0}
        style={iconBtnStyle}
        title="이전 (Shift+Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,10 8,5 12,10" />
        </svg>
      </button>
      <button
        onClick={() => handleNavigate('next')}
        disabled={count === 0}
        style={iconBtnStyle}
        title="다음 (Enter)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4,6 8,11 12,6" />
        </svg>
      </button>
      <button
        onClick={() => window.close()}
        style={iconBtnStyle}
        title="닫기 (Esc)"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="4" x2="12" y2="12" />
          <line x1="12" y1="4" x2="4" y2="12" />
        </svg>
      </button>
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  flexShrink: 0,
  width: 28,
  height: 28
}
