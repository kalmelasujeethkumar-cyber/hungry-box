import type { JSX } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface RevenuePoint {
  label: string;
  revenueMinor: number;
}

export interface BranchRevenuePoint {
  branchName: string;
  revenueMinor: number;
}

export interface OrderCountPoint {
  label: string;
  orders: number;
}

/**
 * The only module in the app that imports `recharts`, reached exclusively through the dynamic
 * import in `chart-slot.tsx`. Measured against the shipped bundle, `recharts` accounts for
 * 387 kB of the 997 kB entry chunk, and two of twenty-six routes ever draw a chart. Keeping
 * the import out of the route graph means a customer loading the storefront, and a manager or
 * partner working all day, never downloads a charting library they cannot use.
 */
function formatPaise(value: number): string {
  return `₹${(value / 100).toLocaleString('en-IN')}`;
}

const GRID = { stroke: '#e2e8f0', strokeDasharray: '3 3' } as const;
const TICK = { fontSize: 12 } as const;
const PAISE = (value: unknown): string => formatPaise(Number(value));

export function RevenueOverTimeChart({ data }: { data: RevenuePoint[] }): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={TICK} />
        <YAxis tick={TICK} tickFormatter={PAISE} />
        <Tooltip formatter={PAISE} />
        <Area
          type="monotone"
          dataKey="revenueMinor"
          name="Revenue"
          stroke="#0091B9"
          fill="#0091B9"
          fillOpacity={0.15}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RevenueByBranchChart({ data }: { data: BranchRevenuePoint[] }): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="branchName" tick={TICK} />
        <YAxis tick={TICK} tickFormatter={PAISE} />
        <Tooltip formatter={PAISE} />
        <Bar dataKey="revenueMinor" name="Revenue" fill="#FF6500" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RevenueBarChart({ data }: { data: RevenuePoint[] }): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={TICK} />
        <YAxis tick={TICK} tickFormatter={PAISE} />
        <Tooltip formatter={PAISE} />
        <Bar dataKey="revenueMinor" name="Revenue" fill="#FF6500" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OrdersOverTimeChart({ data }: { data: OrderCountPoint[] }): JSX.Element {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="label" tick={TICK} />
        <YAxis tick={TICK} allowDecimals={false} />
        <Tooltip />
        <Line type="monotone" dataKey="orders" name="Orders" stroke="#004E9B" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
