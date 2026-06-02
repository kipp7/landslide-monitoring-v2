import type { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

export function PageSection({
  title,
  subtitle,
  aside,
  className,
  children
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  className?: string;
}>) {
  return (
    <section className={clsx("page-section", className)}>
      <header className="page-section__header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {aside ? <div>{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}
