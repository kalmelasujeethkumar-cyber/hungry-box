import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrdersOverTimeChartPanel, RevenueByBranchChartPanel } from './chart-slot';

describe('deferred charts', () => {
  it('shows a loading state first and then mounts the chart', async () => {
    render(<OrdersOverTimeChartPanel data={[{ label: '24 Sep', orders: 12 }]} />);

    expect(screen.getByText(/loading chart/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByText(/loading chart/i)).not.toBeInTheDocument());
  });

  it('renders a chart whose data never becomes a loading state', async () => {
    render(<RevenueByBranchChartPanel data={[{ branchName: 'Hungry Box Guntur', revenueMinor: 2300000 }]} />);

    await waitFor(() => expect(screen.queryByText(/loading chart/i)).not.toBeInTheDocument());
  });
});
