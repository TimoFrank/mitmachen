"use client";

import { useState } from "react";

export function CopyLinkButton({ label = "Link kopieren" }: { label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="button button-secondary" onClick={handleCopy} type="button">
      {copied ? "Link kopiert" : label}
    </button>
  );
}
