/**
 * ProseMirror search plugin for Milkdown.
 * Highlights text matches using Decoration.inline with explicit nodeName: 'span'.
 * Controlled externally via tr.setMeta(searchPluginKey, action).
 */

import { $prose } from '@milkdown/kit/utils'
import { Plugin, PluginKey } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view'
import type { Node as ProsemirrorNode } from '@milkdown/kit/prose/model'

export interface SearchState {
  query: string
  matches: { from: number; to: number }[]
  activeIndex: number
}

export type SearchAction =
  | { type: 'search'; query: string }
  | { type: 'navigate'; direction: 'next' | 'prev' }
  | { type: 'clear' }

export const searchPluginKey = new PluginKey<SearchState>('search')

function findMatches(doc: ProsemirrorNode, query: string): { from: number; to: number }[] {
  if (!query) return []
  const matches: { from: number; to: number }[] = []
  const lowerQuery = query.toLowerCase()

  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let index = 0
      for (;;) {
        const found = text.indexOf(lowerQuery, index)
        if (found === -1) break
        matches.push({ from: pos + found, to: pos + found + query.length })
        index = found + 1
      }
    }
  })

  return matches
}

export const searchPlugin = $prose((_ctx) => {
  return new Plugin({
    key: searchPluginKey,
    state: {
      init(): SearchState {
        return { query: '', matches: [], activeIndex: -1 }
      },
      apply(tr, prev): SearchState {
        const action = tr.getMeta(searchPluginKey) as SearchAction | undefined

        if (action) {
          switch (action.type) {
            case 'search': {
              const matches = findMatches(tr.doc, action.query)
              return {
                query: action.query,
                matches,
                activeIndex: matches.length > 0 ? 0 : -1
              }
            }
            case 'navigate': {
              if (prev.matches.length === 0) return prev
              let idx = prev.activeIndex
              if (action.direction === 'next') {
                idx = (idx + 1) % prev.matches.length
              } else {
                idx = (idx - 1 + prev.matches.length) % prev.matches.length
              }
              return { ...prev, activeIndex: idx }
            }
            case 'clear':
              return { query: '', matches: [], activeIndex: -1 }
          }
        }

        // Recalculate on doc change while search is active
        if (tr.docChanged && prev.query) {
          const matches = findMatches(tr.doc, prev.query)
          const activeIndex = matches.length > 0
            ? Math.min(Math.max(0, prev.activeIndex), matches.length - 1)
            : -1
          return { query: prev.query, matches, activeIndex }
        }

        return prev
      }
    },
    props: {
      decorations(state) {
        const searchState = searchPluginKey.getState(state)
        if (!searchState || searchState.matches.length === 0) return DecorationSet.empty

        const decos = searchState.matches.map((m, i) => {
          const className = i === searchState.activeIndex
            ? 'search-highlight search-highlight-active'
            : 'search-highlight'
          return Decoration.inline(m.from, m.to, {
            nodeName: 'span',
            class: className
          })
        })

        return DecorationSet.create(state.doc, decos)
      }
    }
  })
})
