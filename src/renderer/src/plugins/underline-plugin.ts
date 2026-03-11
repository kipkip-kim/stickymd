/**
 * Milkdown underline plugin.
 * Adds <u> mark support with markdown round-trip via inline HTML.
 *
 * Plan refs: Phase 6b, B-note on underline round-trip.
 */

import { commandsCtx } from '@milkdown/kit/core'
import { toggleMark } from '@milkdown/kit/prose/commands'
import { $command, $markSchema, $useKeymap, $remark } from '@milkdown/kit/utils'

// ---------------------------------------------------------------------------
// 1. Remark plugin — handles <u>text</u> round-trip in markdown
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function remarkUnderline(this: any) {
  const data = this.data()

  // --- to-markdown: serialize underline nodes as <u>…</u> ---
  const existing: any[] = data.toMarkdownExtensions || []
  existing.push({
    handlers: {
      underline(node: any, _parent: any, state: any, info: any) {
        const exit = state.enter('underline')
        const content = state.containerPhrasing(node, {
          before: info.before,
          after: info.after
        })
        exit()
        return `<u>${content}</u>`
      }
    }
  })
  data.toMarkdownExtensions = existing

  // --- from-markdown: tree transform ---
  // After remark parses markdown, inline HTML `<u>` becomes `html` nodes.
  // Walk paragraphs and combine html("<u>") + children + html("</u>")
  // into a single `underline` MDAST node.
  return function transformer(tree: any) {
    visitNode(tree)
  }
}

/** Recursively visit nodes that may contain phrasing content */
function visitNode(node: any): void {
  if (!node.children) return

  // Process children of any node that can contain phrasing content
  node.children = combineUnderlineRuns(node.children)

  // Recurse into all children
  for (const child of node.children) {
    visitNode(child)
  }
}

/** Find html(<u>) + content + html(</u>) sequences and merge them */
function combineUnderlineRuns(children: any[]): any[] {
  const result: any[] = []
  let i = 0

  while (i < children.length) {
    const child = children[i]

    if (child.type === 'html' && child.value === '<u>') {
      // Find matching </u>
      let endIdx = -1
      let depth = 1
      for (let j = i + 1; j < children.length; j++) {
        const c = children[j]
        if (c.type === 'html' && c.value === '<u>') depth++
        if (c.type === 'html' && c.value === '</u>') {
          depth--
          if (depth === 0) {
            endIdx = j
            break
          }
        }
      }

      if (endIdx > i) {
        const innerChildren = children.slice(i + 1, endIdx)
        result.push({
          type: 'underline',
          children: innerChildren
        })
        i = endIdx + 1
        continue
      }
    }

    result.push(child)
    i++
  }

  return result
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Milkdown wrapper for the remark plugin
export const remarkUnderlinePlugin = $remark('remarkUnderline', () => remarkUnderline as any)

// ---------------------------------------------------------------------------
// 2. Milkdown mark schema — ProseMirror underline mark
// ---------------------------------------------------------------------------

export const underlineSchema = $markSchema('underline', () => ({
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration',
      getAttrs: (value) => (value === 'underline') as false
    }
  ],
  toDOM: () => ['u', 0] as const,
  parseMarkdown: {
    match: (node) => node.type === 'underline',
    runner: (state, node, markType) => {
      state.openMark(markType)
      state.next(node.children)
      state.closeMark(markType)
    }
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'underline',
    runner: (state, mark) => {
      state.withMark(mark, 'underline')
    }
  }
}))

// ---------------------------------------------------------------------------
// 3. Command — toggle underline
// ---------------------------------------------------------------------------

export const toggleUnderlineCommand = $command('ToggleUnderline', (ctx) => () => {
  return toggleMark(underlineSchema.type(ctx))
})

// ---------------------------------------------------------------------------
// 4. Keymap — Ctrl+U
// ---------------------------------------------------------------------------

export const underlineKeymap = $useKeymap('underlineKeymap', {
  ToggleUnderline: {
    shortcuts: 'Mod-u',
    command: (ctx) => {
      const commands = ctx.get(commandsCtx)
      return () => commands.call(toggleUnderlineCommand.key)
    }
  }
})

// ---------------------------------------------------------------------------
// Convenience array for .use()
// ---------------------------------------------------------------------------

export const underlinePlugin = [
  remarkUnderlinePlugin,
  underlineSchema,
  toggleUnderlineCommand,
  underlineKeymap
].flat()
