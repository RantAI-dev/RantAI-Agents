// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, act } from "@testing-library/react"
import React, { useReducer, useImperativeHandle, forwardRef } from "react"
import { DocumentRenderer } from "@/features/conversations/components/chat/artifacts/renderers/document-renderer"

const docWithFootnote = JSON.stringify({
  meta: { title: "Test" },
  body: [
    {
      type: "paragraph",
      children: [
        { type: "text", text: "Claim" },
        {
          type: "footnote",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", text: "Citation" }],
            },
          ],
        },
        { type: "text", text: " here." },
      ],
    },
  ],
})

interface WrapperHandle {
  forceRerender: () => void
}

const Wrapper = forwardRef<WrapperHandle>(function Wrapper(_, ref) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useImperativeHandle(ref, () => ({ forceRerender: tick }), [tick])
  return <DocumentRenderer content={docWithFootnote} />
})

describe("DocumentRenderer footnote stability", () => {
  it("does not duplicate footnote entries on re-render with the same content", () => {
    const ref = React.createRef<WrapperHandle>()
    const { container } = render(<Wrapper ref={ref} />)

    const initialEntries = container.querySelectorAll('li[id^="fn-"]')
    expect(initialEntries.length).toBe(1)

    act(() => {
      ref.current?.forceRerender()
    })
    act(() => {
      ref.current?.forceRerender()
    })

    const afterEntries = container.querySelectorAll('li[id^="fn-"]')
    expect(afterEntries.length).toBe(1)
  })
})
