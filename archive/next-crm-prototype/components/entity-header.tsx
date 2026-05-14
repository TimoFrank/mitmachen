import Image from "next/image";
import { ReactNode } from "react";
import { OwnerInlineForm } from "@/components/owner-inline-form";
import { UserOption } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function StatusChip({ label }: { label: string }) {
  return <span className="status-chip">{label}</span>;
}

export function EntityHeader({
  title,
  subtitle,
  status,
  updatedAt,
  accent,
  media,
  owner,
  contactItems,
  returnTo,
  users
}: {
  title: string;
  subtitle: string;
  status: string;
  updatedAt: string;
  accent: "person" | "organization";
  media: {
    src?: string;
    alt: string;
    initials: string;
    kindLabel: string;
  };
  owner: {
    entityType: "person" | "organization";
    entityId: number;
    ownerId: number | null;
  };
  contactItems: {
    icon: ReactNode;
    label: string;
    value: ReactNode;
  }[];
  returnTo: string;
  users: UserOption[];
}) {
  return (
    <section className={`entity-hero card entity-hero-${accent}`}>
      <div className={`entity-visual entity-visual-${accent}`}>
        {media.src ? (
          <Image alt={media.alt} className="entity-visual-image" height={160} src={media.src} width={160} />
        ) : (
          <span className="entity-visual-fallback">{media.initials}</span>
        )}
      </div>

      <div className="entity-hero-main">
        <div className="stack-tight">
          <p className="eyebrow">{media.kindLabel}</p>
          <h3 className="entity-title">{title}</h3>
          <p className="muted">{subtitle}</p>
        </div>
        <div className="entity-contact-strip">
          {contactItems.map((item) => (
            <div className="entity-contact-item" key={item.label}>
              <span className={`entity-contact-icon entity-contact-icon-${accent}`}>{item.icon}</span>
              <span className="entity-contact-copy">
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="entity-meta">
          <StatusChip label={status} />
          <span className="meta-text">Zuletzt aktualisiert {formatDate(updatedAt)}</span>
        </div>
      </div>

      <div className="entity-hero-side">
        <OwnerInlineForm
          entityType={owner.entityType}
          entityId={owner.entityId}
          ownerId={owner.ownerId}
          returnTo={returnTo}
          users={users}
        />
      </div>
    </section>
  );
}
