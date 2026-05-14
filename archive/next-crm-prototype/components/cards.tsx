import Link from "next/link";
import { ReactNode } from "react";

export function StatCard({
  label,
  value,
  href,
  className,
  icon
}: {
  label: string;
  value: number;
  href: string;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Link href={href} className={`stat-card${className ? ` ${className}` : ""}`}>
      <span className="stat-card-label-row">
        <span>{label}</span>
        {icon ? <span className="stat-card-icon">{icon}</span> : null}
      </span>
      <strong>{value}</strong>
    </Link>
  );
}

export function SectionCard({
  title,
  children,
  action,
  className
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      <div className="card-header">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
