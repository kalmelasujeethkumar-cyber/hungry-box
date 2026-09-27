import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { LoadingState } from '../../components/LoadingState';
import type {
  BranchRevenuePoint,
  OrderCountPoint,
  RevenuePoint,
} from './recharts-charts';

/**
 * All four point at the same module, so the bundler emits a single chunk for the charting
 * library and the first chart to mount pays for it once.
 */
const RevenueOverTimeChart = lazy(() =>
  import('./recharts-charts').then((m) => ({ default: m.RevenueOverTimeChart })),
);
const RevenueByBranchChart = lazy(() =>
  import('./recharts-charts').then((m) => ({ default: m.RevenueByBranchChart })),
);
const RevenueBarChart = lazy(() =>
  import('./recharts-charts').then((m) => ({ default: m.RevenueBarChart })),
);
const OrdersOverTimeChart = lazy(() =>
  import('./recharts-charts').then((m) => ({ default: m.OrdersOverTimeChart })),
);

/**
 * Defers the charting library until a chart actually has something to draw.
 *
 * The pages keep their heading, empty state and layout on the critical path, so a panel with
 * no data for the selected period never triggers the `recharts` import at all, and a panel
 * with data paints its own frame immediately and fills the chart in once the chunk lands.
 * Nothing about the rendered result changes - only when the library arrives.
 */
function ChartFrame({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div className="mt-4 h-72 w-full">
      <Suspense fallback={<LoadingState message="Loading chart…" className="h-full min-h-0" />}>
        {children}
      </Suspense>
    </div>
  );
}

export function RevenueOverTimeChartPanel({ data }: { data: RevenuePoint[] }): JSX.Element {
  return (
    <ChartFrame>
      <RevenueOverTimeChart data={data} />
    </ChartFrame>
  );
}

export function RevenueByBranchChartPanel({ data }: { data: BranchRevenuePoint[] }): JSX.Element {
  return (
    <ChartFrame>
      <RevenueByBranchChart data={data} />
    </ChartFrame>
  );
}

export function RevenueBarChartPanel({ data }: { data: RevenuePoint[] }): JSX.Element {
  return (
    <ChartFrame>
      <RevenueBarChart data={data} />
    </ChartFrame>
  );
}

export function OrdersOverTimeChartPanel({ data }: { data: OrderCountPoint[] }): JSX.Element {
  return (
    <ChartFrame>
      <OrdersOverTimeChart data={data} />
    </ChartFrame>
  );
}
