// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import { Editor } from '@tiptap/core'
import type { Editor as ReactEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { createRichMarkdownEditorConfig } from './rich-markdown-editor-config'
import { createConfigParams } from './rich-markdown-editor-config-test-fixture'
import type * as HttpLinkRouting from '@/lib/http-link-routing'

const openHttpLinkMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/http-link-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof HttpLinkRouting>()),
  openHttpLink: openHttpLinkMock
}))

const editors: Editor[] = []

function createEditorWithLink(isMac: boolean): {
  editor: Editor
  activateMarkdownLink: ReturnType<typeof vi.fn>
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const activateMarkdownLink = vi.fn()
  const editorRef: MutableRefObject<ReactEditor | null> = { current: null }
  const { editorProps } = createRichMarkdownEditorConfig(
    createConfigParams({ isMac, activateMarkdownLink, editorRef })
  )
  const editor = new Editor({
    element: host,
    extensions: [StarterKit],
    content: '<p>See <a href="https://example.com/docs">Example</a> here</p>',
    editorProps,
    autofocus: false
  })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the click router only reads core Editor members, which the React Editor re-exports unchanged.
  editorRef.current = editor as unknown as ReactEditor
  editors.push(editor)
  return { editor, activateMarkdownLink }
}

// Why: happy-dom has no layout, so stand in for coordinate lookup with the
// position of the link's text, which is what a real click on it resolves to.
function pointAtLinkText(editor: Editor): HTMLElement {
  const anchor = editor.view.dom.querySelector('a')
  if (!anchor?.firstChild) {
    throw new Error('link not rendered')
  }
  const pos = editor.view.posAtDOM(anchor.firstChild, 2)
  vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos, inside: -1 })
  return anchor
}

function clickWith(target: HTMLElement, modifiers: MouseEventInit): void {
  const init = { bubbles: true, cancelable: true, button: 0, ...modifiers }
  target.dispatchEvent(new MouseEvent('mousedown', init))
  target.dispatchEvent(new MouseEvent('mouseup', init))
  target.dispatchEvent(new MouseEvent('click', init))
}

beforeEach(() => {
  openHttpLinkMock.mockReset()
  vi.stubGlobal('api', { ui: { setMarkdownEditorFocused: vi.fn() } })
})

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.view.dom.parentElement?.remove()
    editor.destroy()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('rich markdown editor Shift+modifier click through the real editor', () => {
  it('opens an external link in the system browser on Shift+Cmd+click', () => {
    const { editor, activateMarkdownLink } = createEditorWithLink(true)

    clickWith(pointAtLinkText(editor), { metaKey: true, shiftKey: true })

    expect(openHttpLinkMock).toHaveBeenCalledOnce()
    expect(openHttpLinkMock).toHaveBeenCalledWith('https://example.com/docs', {
      forceSystemBrowser: true,
      sourceOwner: { kind: 'local' }
    })
    expect(activateMarkdownLink).not.toHaveBeenCalled()
  })

  it('opens an external link in the system browser on Shift+Ctrl+click off macOS', () => {
    const { editor } = createEditorWithLink(false)

    clickWith(pointAtLinkText(editor), { ctrlKey: true, shiftKey: true })

    expect(openHttpLinkMock).toHaveBeenCalledOnce()
    expect(openHttpLinkMock).toHaveBeenCalledWith(
      'https://example.com/docs',
      expect.objectContaining({ forceSystemBrowser: true })
    )
  })

  it('keeps Cmd+click on Orca link routing', () => {
    const { editor, activateMarkdownLink } = createEditorWithLink(true)

    clickWith(pointAtLinkText(editor), { metaKey: true })

    expect(activateMarkdownLink).toHaveBeenCalledOnce()
    expect(activateMarkdownLink).toHaveBeenCalledWith(
      'https://example.com/docs',
      expect.objectContaining({ sourceFilePath: '/repo/README.md' })
    )
    expect(openHttpLinkMock).not.toHaveBeenCalled()
  })

  it('leaves a plain Shift+click to extend the selection', () => {
    const { editor, activateMarkdownLink } = createEditorWithLink(true)
    const anchor = pointAtLinkText(editor)
    const mousedown = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true
    })

    anchor.dispatchEvent(mousedown)

    expect(mousedown.defaultPrevented).toBe(false)
    expect(openHttpLinkMock).not.toHaveBeenCalled()
    expect(activateMarkdownLink).not.toHaveBeenCalled()
  })
})
