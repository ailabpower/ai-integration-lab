"use client";

import type { Provider } from "@/lib/ai";

const OPTIONS: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Claude" },
  { value: "openai", label: "OpenAI" },
];

export function ProviderToggle({ value, onChange }: { value: Provider; onChange: (p: Provider) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-sm" role="radiogroup" aria-label="Model provider">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 transition ${value === o.value ? "bg-[var(--fg)] text-[var(--bg)]" : "text-[var(--muted)] hover:text-[var(--fg)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
