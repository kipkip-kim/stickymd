import { useCallback } from 'react'
import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { callCommand } from '@milkdown/kit/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
  insertHrCommand
} from '@milkdown/kit/preset/commonmark'
import {
  setBlockTypeCommand,
  addBlockTypeCommand
} from '@milkdown/kit/preset/commonmark'
import type { SlashCommand } from '../constants/slash-commands'

export function useSlashExecute(getEditor: () => Editor | undefined) {
  const execute = useCallback(
    (command: SlashCommand) => {
      const editor = getEditor()
      if (!editor) return

      const view = editor.ctx.get(editorViewCtx)

      switch (command.id) {
        case 'h1':
        case 'h2':
        case 'h3': {
          const level = parseInt(command.id.slice(1), 10)
          const { schema } = view.state
          const headingType = schema.nodes['heading']
          if (headingType) {
            editor.action(callCommand(setBlockTypeCommand.key, { nodeType: headingType, attrs: { level } }))
          }
          break
        }
        case 'bullet':
          editor.action(callCommand(wrapInBulletListCommand.key))
          break
        case 'numbered':
          editor.action(callCommand(wrapInOrderedListCommand.key))
          break
        case 'todo': {
          // Insert a task list item
          const { schema, tr } = view.state
          const listItemType = schema.nodes['list_item']
          const bulletListType = schema.nodes['bullet_list']
          if (listItemType && bulletListType) {
            // Create a checked list item
            const listItem = listItemType.create({ checked: false }, schema.nodes['paragraph']!.create())
            const bulletList = bulletListType.create(null, listItem)
            const newTr = tr.replaceSelectionWith(bulletList)
            view.dispatch(newTr)
          }
          break
        }
        case 'code': {
          const { schema } = view.state
          const codeBlockType = schema.nodes['code_block']
          if (codeBlockType) {
            editor.action(callCommand(addBlockTypeCommand.key, { nodeType: codeBlockType }))
          }
          break
        }
        case 'quote':
          editor.action(callCommand(wrapInBlockquoteCommand.key))
          break
        case 'divider':
          editor.action(callCommand(insertHrCommand.key))
          break
        case 'bold':
          editor.action(callCommand(toggleStrongCommand.key))
          break
        case 'italic':
          editor.action(callCommand(toggleEmphasisCommand.key))
          break
        case 'link': {
          // Insert a link placeholder
          const { schema, tr } = view.state
          const linkMark = schema.marks['link']
          if (linkMark) {
            const mark = linkMark.create({ href: 'https://' })
            const textNode = schema.text('링크', [mark])
            const newTr = tr.replaceSelectionWith(textNode)
            view.dispatch(newTr)
          }
          break
        }
      }

      // Re-focus editor
      view.focus()
    },
    [getEditor]
  )

  return execute
}
