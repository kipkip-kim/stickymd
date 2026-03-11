import { useState, useCallback, useRef, useEffect } from 'react'
import type { Editor } from '@milkdown/kit/core'
import { editorViewCtx } from '@milkdown/kit/core'
import { filterCommands, type SlashCommand } from '../constants/slash-commands'

interface SlashCommandState {
  isOpen: boolean
  query: string
  commands: SlashCommand[]
  selectedIndex: number
  position: { top: number; left: number }
  maxWidth: number
}

interface UseSlashCommandReturn {
  state: SlashCommandState
  handleSelect: (command: SlashCommand) => void
}

export function useSlashCommand(
  getEditor: () => Editor | undefined,
  onExecute: (command: SlashCommand) => void
): UseSlashCommandReturn {
  const [state, setState] = useState<SlashCommandState>({
    isOpen: false,
    query: '',
    commands: [],
    selectedIndex: 0,
    position: { top: 0, left: 0 },
    maxWidth: 240
  })

  const slashPosRef = useRef<number | null>(null)
  const isComposingRef = useRef(false)

  const close = useCallback(() => {
    setState((s) => ({ ...s, isOpen: false, query: '', selectedIndex: 0 }))
    slashPosRef.current = null
  }, [])

  const handleSelect = useCallback(
    (command: SlashCommand) => {
      const editor = getEditor()
      if (!editor) return

      const view = editor.ctx.get(editorViewCtx)
      const { state: editorState, dispatch } = view

      // Delete the slash and query text
      if (slashPosRef.current !== null) {
        const from = slashPosRef.current
        const to = editorState.selection.head
        const tr = editorState.tr.delete(from, to)
        dispatch(tr)
      }

      close()
      onExecute(command)
    },
    [getEditor, close, onExecute]
  )

  // Set up key event interception and input monitoring
  useEffect(() => {
    const editor = getEditor()
    if (!editor) return

    const view = editor.ctx.get(editorViewCtx)
    const dom = view.dom

    // B3: Track IME composition state
    const onCompositionStart = (): void => {
      isComposingRef.current = true
    }
    const onCompositionEnd = (): void => {
      isComposingRef.current = false
      // Check if last composed char is `/`
      checkForSlash()
    }

    const checkForSlash = (): void => {
      const { state: editorState } = view
      const { $head } = editorState.selection
      const textBefore = $head.parent.textContent.slice(0, $head.parentOffset)

      // Find the last `/` position
      const lastSlashIndex = textBefore.lastIndexOf('/')
      if (lastSlashIndex === -1) {
        close()
        return
      }

      // Only trigger if slash is at start of line or after whitespace
      if (lastSlashIndex > 0 && textBefore[lastSlashIndex - 1] !== ' ' && textBefore[lastSlashIndex - 1] !== '\n') {
        return
      }

      const query = textBefore.slice(lastSlashIndex + 1)
      const commands = filterCommands(query)

      // Store the absolute position of the slash in the doc
      const resolvedPos = editorState.doc.resolve($head.pos)
      const newSlashPos = resolvedPos.pos - query.length - 1

      // Only calculate position when first opening (slash just typed)
      if (slashPosRef.current === null) {
        slashPosRef.current = newSlashPos
        const coords = view.coordsAtPos(editorState.selection.head)
        const editorRect = dom.getBoundingClientRect()

        setState({
          isOpen: true,
          query,
          commands,
          selectedIndex: 0,
          position: {
            top: coords.bottom - editorRect.top + 4,
            left: coords.left - editorRect.left
          },
          maxWidth: editorRect.width
        })
      } else {
        // Already open — only update query and commands, keep position fixed
        setState((s) => ({
          ...s,
          query,
          commands,
          selectedIndex: 0
        }))
      }
    }

    const onInput = (): void => {
      if (isComposingRef.current) return
      checkForSlash()
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!slashPosRef.current && slashPosRef.current !== 0) return

      // Don't intercept during IME composition (B3)
      if (isComposingRef.current) return

      setState((s) => {
        if (!s.isOpen) return s

        if (e.key === 'ArrowDown') {
          e.preventDefault()
          const newIndex = Math.min(s.selectedIndex + 1, Math.min(s.commands.length, 8) - 1)
          return { ...s, selectedIndex: newIndex }
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          const newIndex = Math.max(s.selectedIndex - 1, 0)
          return { ...s, selectedIndex: newIndex }
        }
        if (e.key === 'Enter') {
          e.preventDefault()
          const cmd = s.commands[s.selectedIndex]
          if (cmd) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => handleSelect(cmd), 0)
          }
          return { ...s, isOpen: false }
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          close()
          return { ...s, isOpen: false }
        }
        return s
      })
    }

    // Handle cursor movement that might leave slash context
    const onSelectionChange = (): void => {
      if (slashPosRef.current === null) return
      const { state: editorState } = view
      const headPos = editorState.selection.head

      if (headPos <= (slashPosRef.current ?? 0)) {
        close()
      }
    }

    dom.addEventListener('compositionstart', onCompositionStart)
    dom.addEventListener('compositionend', onCompositionEnd)
    dom.addEventListener('input', onInput)
    dom.addEventListener('keydown', onKeyDown, true) // capture phase
    dom.addEventListener('blur', close)

    // Use ProseMirror's update to track selection changes
    const origDispatch = view.dispatch.bind(view)
    view.dispatch = (...args) => {
      origDispatch(...args)
      onSelectionChange()
    }

    return () => {
      dom.removeEventListener('compositionstart', onCompositionStart)
      dom.removeEventListener('compositionend', onCompositionEnd)
      dom.removeEventListener('input', onInput)
      dom.removeEventListener('keydown', onKeyDown, true)
      dom.removeEventListener('blur', close)
      view.dispatch = origDispatch
    }
  }, [getEditor, close, handleSelect])

  return { state, handleSelect }
}
