import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FilterChips } from './FilterChips';

const OPTIONS = [
  { value: undefined, label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
] as const;

describe('FilterChips', () => {
  it('marks only the active option as pressed', () => {
    render(
      <FilterChips
        options={OPTIONS}
        value="ACTIVE"
        onChange={vi.fn()}
        ariaLabel="Filter managers by status"
      />,
    );

    expect(screen.getByRole('group', { name: 'Filter managers by status' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the selected option value, including the reset option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <FilterChips options={OPTIONS} value="ACTIVE" onChange={onChange} ariaLabel="Status" />,
    );

    await user.click(screen.getByRole('button', { name: 'Suspended' }));
    expect(onChange).toHaveBeenCalledWith('SUSPENDED');

    rerender(
      <FilterChips options={OPTIONS} value="SUSPENDED" onChange={onChange} ariaLabel="Status" />,
    );
    await user.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
