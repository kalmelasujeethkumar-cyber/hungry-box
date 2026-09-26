import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function renderDialog(overrides: { open?: boolean; onClose?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <Dialog
      open={overrides.open ?? true}
      onClose={onClose}
      title="Confirm action"
      description="This cannot be undone."
      footer={<button type="button">Confirm</button>}
    >
      <p>Body content</p>
    </Dialog>,
  );
  return { onClose };
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a labelled, modal dialog with content and focus', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Confirm action' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent('Body content');
    expect(dialog).toHaveTextContent('Confirm');

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
  });

  it('locks body scroll while open and restores it after close', () => {
    const { rerender } = render(
      <Dialog open onClose={vi.fn()} title="Open" />,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Dialog open={false} onClose={vi.fn()} title="Open" />,
    );
    expect(document.body.style.overflow).toBe('');
  });

  it('closes on Escape', () => {
    const { onClose } = renderDialog();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked', () => {
    const { onClose } = renderDialog();

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a backdrop click when disabled', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirm action" closeOnBackdrop={false} />,
    );

    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes via the close button', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});