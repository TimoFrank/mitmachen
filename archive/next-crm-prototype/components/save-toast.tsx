"use client";

import { useEffect, useState } from "react";

const messages: Record<string, string> = {
  "person-created": "Person gespeichert.",
  "person-updated": "Person aktualisiert.",
  "organization-created": "Organisation gespeichert.",
  "organization-updated": "Organisation aktualisiert.",
  "owner-updated": "Owner aktualisiert.",
  "note-saved": "Notiz gespeichert."
};

export function SaveToast({ saved }: { saved?: string }) {
  const [visible, setVisible] = useState(Boolean(saved && messages[saved]));

  useEffect(() => {
    if (!saved || !messages[saved]) {
      return;
    }

    const timer = window.setTimeout(() => setVisible(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (!saved || !messages[saved] || !visible) {
    return null;
  }

  return (
    <div className="save-toast" role="status" aria-live="polite">
      {messages[saved]}
    </div>
  );
}
