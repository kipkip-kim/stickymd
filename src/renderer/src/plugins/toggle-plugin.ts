/**
 * Milkdown toggle (collapsible) block plugin.
 * Adds <details>/<summary> support with markdown round-trip via inline HTML.
 *
 * - `> ` input rule creates a toggle block (replaces default blockquote)
 * - NodeView for native <details> toggle (click to expand/collapse)
 * - Blockquote remains available via slash command `/인용`
 */

import { $nodeSchema, $inputRule, $prose } from '@milkdown/kit/utils'
import { inputRulesCtx, SchemaReady, InitReady, remarkPluginsCtx } from '@milkdown/kit/core'
import { Plugin, Selection } from '@milkdown/kit/prose/state'
import { TextSelection } from '@milkdown/kit/prose/state'
import { InputRule } from '@milkdown/kit/prose/inputrules'
import { keymap } from '@milkdown/kit/prose/keymap'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// 1. Remark plugin — handles <details>/<summary> round-trip in markdown
// ---------------------------------------------------------------------------

function remarkToggle(this: any) {
  const data = this.data()

  // --- to-markdown: serialize details MDAST nodes as <details> HTML ---
  const existing: any[] = data.toMarkdownExtensions || []
  existing.push({
    handlers: {
      details(node: any, _parent: any, state: any, info: any) {
        const summaryChild = node.children?.find((c: any) => c.type === 'details_summary')
        const contentChildren =
          node.children?.filter((c: any) => c.type !== 'details_summary') || []

        let summaryText = '토글'
        if (summaryChild?.children?.length) {
          summaryText = summaryChild.children.map((c: any) => c.value ?? '').join('')
        }

        let contentStr = ''
        if (contentChildren.length > 0) {
          const exit = state.enter('details')
          contentStr = state.containerFlow(
            { type: 'root', children: contentChildren },
            info
          )
          exit()
        }

        const openAttr = node.data?.open !== false ? ' open' : ''
        return `<details${openAttr}>\n<summary>${summaryText}</summary>\n\n${contentStr}\n\n</details>`
      },
      details_summary(node: any, _parent: any, state: any, info: any) {
        return state.containerPhrasing(node, { before: info.before, after: info.after })
      }
    }
  })
  data.toMarkdownExtensions = existing

  // --- from-markdown: tree transform ---
  // Walk the MDAST tree and combine html("<details>...") + content + html("</details>")
  // sequences into custom `details` MDAST nodes.
  return function transformer(tree: any) {
    combineDetailsBlocks(tree)
  }
}

/** Find <details>…</details> HTML block sequences and merge them into MDAST nodes */
function combineDetailsBlocks(tree: any): void {
  if (!tree.children) return

  const result: any[] = []
  let i = 0

  while (i < tree.children.length) {
    const child = tree.children[i]

    if (
      child.type === 'html' &&
      typeof child.value === 'string' &&
      child.value.trimStart().startsWith('<details')
    ) {
      // Extract summary from the opening HTML block
      const summaryMatch = child.value.match(/<summary>(.*?)<\/summary>/s)
      const summaryText = summaryMatch ? summaryMatch[1].trim() : '토글'

      // Find matching </details>
      let endIdx = -1
      for (let j = i + 1; j < tree.children.length; j++) {
        const c = tree.children[j]
        if (
          c.type === 'html' &&
          typeof c.value === 'string' &&
          c.value.trim() === '</details>'
        ) {
          endIdx = j
          break
        }
      }

      if (endIdx > i) {
        const contentChildren = tree.children.slice(i + 1, endIdx)
        // Detect open attribute: <details open> vs <details>
        const isOpen = /\bopen\b/.test(child.value.split('>')[0] || '')
        result.push({
          type: 'details',
          data: { open: isOpen },
          children: [
            {
              type: 'details_summary',
              children: [{ type: 'text', value: summaryText }]
            },
            ...contentChildren
          ]
        })
        i = endIdx + 1
        continue
      }
    }

    result.push(child)
    i++
  }

  tree.children = result
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// Raw MilkdownPlugin: PREPEND our remark plugin to remarkPluginsCtx so it runs
// BEFORE commonmark's remarkHtmlTransformer (which converts html→paragraph nodes).
const remarkTogglePlugin = (ctx: any) => async () => {
  await ctx.wait(InitReady)
  ctx.update(remarkPluginsCtx, (rp: any[]) => [
    { plugin: remarkToggle, options: {} },
    ...rp
  ])
}

// ---------------------------------------------------------------------------
// 2. Node schemas
// ---------------------------------------------------------------------------

// Summary node — first child of details, plain text only (no marks)
export const detailsSummarySchema = $nodeSchema('details_summary', () => ({
  content: 'text*',
  marks: '',
  defining: true,
  parseDOM: [{ tag: 'summary' }],
  toDOM: () => ['summary', { class: 'toggle-summary' }, 0] as const,
  parseMarkdown: {
    match: (node: any) => node.type === 'details_summary',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type)
      state.next(node.children)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node: any) => node.type.name === 'details_summary',
    runner: (state: any, node: any) => {
      state.openNode('details_summary')
      state.next(node.content)
      state.closeNode()
    }
  }
}))

// Details (toggle) container node
export const detailsSchema = $nodeSchema('details', () => ({
  content: 'details_summary block+',
  group: 'block',
  defining: true,
  attrs: { open: { default: true } },
  parseDOM: [
    {
      tag: 'div.toggle-block',
      getAttrs: (dom: any) => ({
        open: (dom as HTMLElement).classList.contains('toggle-open')
      })
    }
  ],
  toDOM: (node: any) =>
    [
      'div',
      {
        class: 'toggle-block' + (node.attrs.open ? ' toggle-open' : '')
      },
      0
    ] as const,
  parseMarkdown: {
    match: (node: any) => node.type === 'details',
    runner: (state: any, node: any, type: any) => {
      state.openNode(type, { open: node.data?.open !== false })
      state.next(node.children)
      state.closeNode()
    }
  },
  toMarkdown: {
    match: (node: any) => node.type.name === 'details',
    runner: (state: any, node: any) => {
      state.openNode('details', undefined, { data: { open: node.attrs.open } })
      state.next(node.content)
      state.closeNode()
    }
  }
}))

// ---------------------------------------------------------------------------
// 3. Remove blockquote inputRule (> + space) and add toggle inputRule
// ---------------------------------------------------------------------------

// Raw MilkdownPlugin: remove the blockquote wrapping inputRule after commonmark registers it
const removeBlockquoteInputRule = (ctx: any) => async () => {
  await ctx.wait(SchemaReady)
  ctx.update(inputRulesCtx, (rules: any[]) =>
    rules.filter((r: any) => !(r.match && r.match.source === '^\\s*>\\s$'))
  )
}

// Toggle inputRule: `> ` at start of line creates a toggle block
export const toggleInputRule = $inputRule((ctx) => {
  const detailsType = detailsSchema.type(ctx)
  const summaryType = detailsSummarySchema.type(ctx)

  return new InputRule(/^\s*>\s$/, (state, _match, start) => {
    // Resolve position in original doc to find parent block boundaries
    const $start = state.doc.resolve(start)
    const parentStart = $start.before($start.depth)
    const parentEnd = $start.after($start.depth)

    // Create toggle block: summary (empty) + paragraph (empty)
    const summary = summaryType.create(null)
    const para = state.schema.nodes.paragraph.create(null)
    const details = detailsType.create({ open: true }, [summary, para])

    // Replace the current paragraph with the toggle block
    const tr = state.tr.replaceWith(parentStart, parentEnd, details)

    // Place cursor inside the summary
    // Position: parentStart + 1 (enter details) + 1 (enter summary)
    tr.setSelection(TextSelection.create(tr.doc, parentStart + 2))

    return tr
  })
})

// ---------------------------------------------------------------------------
// 4. NodeView — native <details> toggle behavior via click
// ---------------------------------------------------------------------------

export const toggleNodeView = $prose((_ctx) => {
  return new Plugin({
    props: {
      nodeViews: {
        details(node, view, getPos) {
          // Use <div> instead of <details> to avoid native browser quirks
          const dom = document.createElement('div')
          dom.className = 'toggle-block' + (node.attrs.open ? ' toggle-open' : '')

          // Toggle button — outside contentDOM, not managed by ProseMirror
          const toggleBtn = document.createElement('span')
          toggleBtn.className = 'toggle-btn'
          toggleBtn.setAttribute('contenteditable', 'false')
          toggleBtn.textContent = '▶'
          dom.appendChild(toggleBtn)

          // contentDOM — ProseMirror renders summary + block+ children here flat
          const contentDOM = document.createElement('div')
          contentDOM.className = 'toggle-content-wrapper'
          dom.appendChild(contentDOM)

          // Click toggle button → toggle open/closed
          toggleBtn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const pos = getPos()
            if (pos === undefined) return
            const currentNode = view.state.doc.nodeAt(pos)
            if (!currentNode) return
            view.dispatch(
              view.state.tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                open: !currentNode.attrs.open
              })
            )
          })

          return {
            dom,
            contentDOM,
            update(updatedNode) {
              if (updatedNode.type.name !== 'details') return false
              dom.classList.toggle('toggle-open', !!updatedNode.attrs.open)
              return true
            }
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Keymap — Backspace to unwrap/delete toggle block
// ---------------------------------------------------------------------------

export const toggleKeymap = $prose((_ctx) => {
  return keymap({
    'Backspace': (state, dispatch) => {
      const { $from } = state.selection

      // Check if cursor is at the start of a details_summary node
      if ($from.parent.type.name === 'details_summary' && $from.parentOffset === 0) {
        // Find the details ancestor
        for (let d = $from.depth; d >= 0; d--) {
          const node = $from.node(d)
          if (node.type.name === 'details') {
            if (!dispatch) return true
            const detailsPos = $from.before(d)

            // Collect content: summary text as paragraph + remaining block children
            const fragments: any[] = []
            const summaryNode = node.firstChild
            if (summaryNode && summaryNode.textContent) {
              fragments.push(state.schema.nodes.paragraph.create(null, state.schema.text(summaryNode.textContent)))
            }
            // Add remaining children (block+ after summary)
            for (let i = 1; i < node.childCount; i++) {
              fragments.push(node.child(i))
            }

            if (fragments.length === 0) {
              fragments.push(state.schema.nodes.paragraph.create(null))
            }

            const tr = state.tr.replaceWith(detailsPos, detailsPos + node.nodeSize, fragments)
            tr.setSelection(TextSelection.create(tr.doc, detailsPos + 1))
            dispatch(tr)
            return true
          }
        }
      }

      // Check if cursor is at start of first block inside details (right after summary)
      // and that block is empty → delete the block, or if it's the only block, unwrap
      if ($from.parentOffset === 0) {
        for (let d = $from.depth; d >= 0; d--) {
          if ($from.node(d).type.name === 'details') {
            const detailsNode = $from.node(d)
            // If cursor is in the second child (first block after summary) and it's empty
            const childIdx = $from.index(d)
            if (childIdx === 1 && $from.parent.content.size === 0 && detailsNode.childCount === 2) {
              // Only summary + one empty block → unwrap whole toggle
              if (!dispatch) return true
              const detailsPos = $from.before(d)
              const summaryNode = detailsNode.firstChild
              const para = summaryNode && summaryNode.textContent
                ? state.schema.nodes.paragraph.create(null, state.schema.text(summaryNode.textContent))
                : state.schema.nodes.paragraph.create(null)
              const tr = state.tr.replaceWith(detailsPos, detailsPos + detailsNode.nodeSize, [para])
              tr.setSelection(TextSelection.create(tr.doc, detailsPos + 1))
              dispatch(tr)
              return true
            }
            break
          }
        }
      }

      return false
    },
    'Delete': (state, dispatch) => {
      // If entire toggle block is selected via node selection, delete it
      const { $from, $to } = state.selection
      for (let d = $from.depth; d >= 0; d--) {
        if ($from.node(d).type.name === 'details') {
          const detailsEnd = $from.after(d)
          if ($to.pos === detailsEnd - 1 && $from.pos === $to.pos) {
            // At end of toggle block — let default behavior handle (merge with next block)
            return false
          }
        }
      }

      // Handle NodeSelection of details
      if (state.selection instanceof Selection && 'node' in state.selection) {
        const sel = state.selection as any
        if (sel.node?.type?.name === 'details') {
          if (!dispatch) return true
          const tr = state.tr.deleteSelection()
          dispatch(tr)
          return true
        }
      }

      return false
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Export combined plugin
// ---------------------------------------------------------------------------

export const togglePlugin = [
  remarkTogglePlugin,
  detailsSummarySchema,
  detailsSchema,
  removeBlockquoteInputRule,
  toggleInputRule,
  toggleNodeView,
  toggleKeymap
].flat()
