"use client";
// Renders one ```mermaid block. The mermaid package (large) is loaded only on pages that have a
// diagram, and the chart is re-rendered when the theme changes (data-theme or the OS setting).
import { useEffect, useId, useState } from "react";

function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function Mermaid({ chart }: { chart: string }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => setDark(isDark());
    update();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);

  useEffect(() => {
    if (dark === null) return;
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "neutral",
          fontFamily: "var(--font-instrument-sans), system-ui, sans-serif",
        });
        const out = await mermaid.render(`${id}-${dark ? "d" : "l"}`, chart);
        if (!cancelled) {
          setSvg(out.svg);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  if (failed || svg === null) {
    return (
      <pre className="doc-pre" aria-busy={!failed}>
        <code>{chart}</code>
      </pre>
    );
  }
  // mermaid's strict security level sanitizes labels (DOMPurify) and disables click handlers.
  return <div className="doc-mermaid" role="img" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
