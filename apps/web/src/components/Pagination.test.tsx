import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination from './Pagination';

describe('Pagination', () => {
  it('reports the matching total rather than implying the page is everything', () => {
    render(
      <Pagination page={2} limit={25} total={312} shown={25} onPageChange={vi.fn()} filtered />,
    );

    expect(screen.getByTestId('pagination-summary')).toHaveTextContent(
      'Showing 26–50 of 312 matching',
    );
  });

  it('marks a filtered list with no matches instead of showing a page', () => {
    render(<Pagination page={1} limit={25} total={0} shown={0} onPageChange={vi.fn()} filtered />);

    expect(screen.getByTestId('pagination-summary')).toHaveTextContent('No matching records');
  });

  it('marks an unfiltered empty list as not yet populated', () => {
    render(<Pagination page={1} limit={25} total={0} shown={0} onPageChange={vi.fn()} />);

    expect(screen.getByTestId('pagination-summary')).toHaveTextContent('No records yet');
  });

  it('advances and goes back a page', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} limit={25} total={100} shown={25} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('disables back on the first page and next on the last page', () => {
    const { rerender } = render(
      <Pagination page={1} limit={25} total={100} shown={25} onPageChange={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();

    rerender(<Pagination page={4} limit={25} total={100} shown={25} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });

  it('disables both controls when a list is exactly one page', () => {
    render(<Pagination page={1} limit={25} total={3} shown={3} onPageChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows a final partial page accurately', () => {
    render(<Pagination page={3} limit={25} total={60} shown={10} onPageChange={vi.fn()} />);

    expect(screen.getByTestId('pagination-summary')).toHaveTextContent('Showing 51–60 of 60');
    expect(screen.getByTestId('pagination-position')).toHaveTextContent('Page 3 of 3');
  });

  it('cannot be paged while the list is refreshing', () => {
    render(
      <Pagination
        page={2}
        limit={25}
        total={100}
        shown={25}
        onPageChange={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  });
});
