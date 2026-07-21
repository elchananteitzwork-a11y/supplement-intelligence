'use client'

import { useState } from 'react'

export default function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button onClick={copy} className="text-xs font-mono uppercase text-pi-sub hover:text-pi-ink transition-colors px-3 py-2">
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  )
}
