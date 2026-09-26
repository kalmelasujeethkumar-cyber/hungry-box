import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, badgeToneClass } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the status label', () => {
    render(<StatusBadge label="Delivered" />);
    expect(screen.getByText('Delivered')).toBeInTheDocument();
  });

  it('falls back to the neutral tone when no tone is given', () => {
    render(<StatusBadge label="Pending" />);
    expect(screen.getByText('Pending')).toHaveClass(
      badgeToneClass.neutral.split(' ').map((part) => part).join(' '),
    );
  });

  it('applies the tone class map for every supported tone', () => {
    const { rerender } = render(<StatusBadge label="OK" tone="success" />);
    expect(screen.getByText('OK')).toHaveClass('bg-emerald-100', 'text-emerald-800');

    rerender(<StatusBadge label="OK" tone="warning" />);
    expect(screen.getByText('OK')).toHaveClass('bg-amber-100');

    rerender(<StatusBadge label="OK" tone="danger" />);
    expect(screen.getByText('OK')).toHaveClass('bg-red-100', 'text-red-700');

    rerender(<StatusBadge label="OK" tone="info" />);
    expect(screen.getByText('OK')).toHaveClass('bg-brand-sky/60');

    rerender(<StatusBadge label="OK" tone="accent" />);
    expect(screen.getByText('OK')).toHaveClass('bg-brand-teal/10');

    rerender(<StatusBadge label="OK" tone="gold" />);
    expect(screen.getByText('OK')).toHaveClass('bg-brand-yellow/30');
  });

  it('merges an extra className without replacing the tone', () => {
    render(<StatusBadge label="Ready" tone="success" className="uppercase" />);
    expect(screen.getByText('Ready')).toHaveClass('uppercase', 'bg-emerald-100');
  });
});