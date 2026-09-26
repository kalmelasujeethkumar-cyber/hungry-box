import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EmptyState from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('announces the default loading message', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('renders a custom message', () => {
    render(<LoadingState message="Loading profile" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile');
  });
});

describe('ErrorState', () => {
  it('shows a friendly error and the technical detail when available', () => {
    render(<ErrorState error={new Error('DB timeout')} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByText('DB timeout')).toBeInTheDocument();
  });

  it('does not repeat the same text as title and message', () => {
    render(<ErrorState title="Oops" message="Oops" error={new Error('Oops')} />);
    expect(screen.getAllByText('Oops').length).toBe(2);
  });

  it('triggers the retry action', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} retryLabel="Reload" />);

    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyState', () => {
  it('renders title, message and an optional action', () => {
    render(
      <EmptyState
        icon={<span>#</span>}
        title="No orders yet"
        message="Orders will appear here once placed."
        action={<button type="button">Browse menu</button>}
      />,
    );

    expect(screen.getByText('No orders yet')).toBeInTheDocument();
    expect(screen.getByText('Orders will appear here once placed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse menu' })).toBeInTheDocument();
  });
});
