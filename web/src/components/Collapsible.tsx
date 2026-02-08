import { useEffect, useMemo, useState } from "react";

export function Collapsible(props: {
  id: string;
  title: React.ReactNode;
  defaultExpanded?: boolean;
  headerRight?: React.ReactNode;
  /** Rendered inside the header (e.g. shader overlay). Receives current expanded state. */
  headerOverlay?: (expanded: boolean) => React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const { id, title, defaultExpanded, headerRight, headerOverlay, className, children } = props;

  const storageKey = useMemo(() => `obeliskfarm:web:ui:collapse:${id}`, [id]);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {
      // ignore
    }
    return defaultExpanded ?? true;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, expanded ? "1" : "0");
    } catch {
      // ignore
    }
  }, [expanded, storageKey]);

  return (
    <div className={className ? `collapseWrap ${className}` : "collapseWrap"}>
      <div className="collapseHeader">
        {headerOverlay?.(expanded)}
        <button className="collapseToggle" type="button" onClick={() => setExpanded((x) => !x)} aria-expanded={expanded}>
          {expanded ? "▼" : "▶"}
        </button>
        <div className="collapseTitle">{title}</div>
        <div style={{ marginLeft: "auto" }}>{headerRight}</div>
      </div>
      {expanded ? <div className="collapseBody">{children}</div> : null}
    </div>
  );
}

