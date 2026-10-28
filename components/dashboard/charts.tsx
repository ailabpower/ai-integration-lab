"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const money = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`);
const axis = { stroke: "var(--muted)", fontSize: 12, tickLine: false, axisLine: false } as const;
const tooltipStyle = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

export type ChartSpec =
  | { type: "line"; data: Record<string, string | number>[]; x: string; y: string; format?: "money" | "number" }
  | { type: "bar"; data: Record<string, string | number>[]; x: string; y: string; format?: "money" | "number" | "percent"; horizontal?: boolean };

function fmt(format: "money" | "number" | "percent" | undefined) {
  if (format === "money") return money;
  if (format === "percent") return (v: number) => `${Math.round(v * 1000) / 10}%`;
  return (v: number) => v.toLocaleString("en-US");
}

export function Chart({ spec, height = 260 }: { spec: ChartSpec; height?: number }) {
  const f = fmt(spec.format);
  if (spec.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={spec.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey={spec.x} {...axis} minTickGap={24} />
          <YAxis {...axis} tickFormatter={f} width={56} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => f(Number(v))} />
          <Line type="monotone" dataKey={spec.y} stroke="var(--accent)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (spec.horizontal) {
    return (
      <ResponsiveContainer width="100%" height={Math.max(height, spec.data.length * 30)}>
        <BarChart data={spec.data} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={f} />
          <YAxis type="category" dataKey={spec.x} {...axis} width={150} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => f(Number(v))} />
          <Bar dataKey={spec.y} fill="var(--accent)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={spec.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis dataKey={spec.x} {...axis} />
        <YAxis {...axis} tickFormatter={f} width={56} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => f(Number(v))} />
        <Bar dataKey={spec.y} fill="var(--accent)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
