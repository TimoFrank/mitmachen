"use client";

import { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel = "Speichert...",
  className
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={className || "button button-primary"} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}
