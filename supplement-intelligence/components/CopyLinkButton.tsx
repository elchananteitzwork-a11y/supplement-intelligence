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
    <button onClick={copy} className="btn-ghost text-xs">
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  )
}
