import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label with the primary variant by default', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('bg-brand-orange');
  });

  it('applies variant and size classes', () => {
    const { rerender } = render(
      <Button variant="secondary" size="lg">
        Save
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('border', 'border-slate-300');
    expect(screen.getByRole('button')).toHaveClass('px-6', 'py-3');

    rerender(
      <Button variant="destructive" size="sm">
        Remove
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('bg-red-600', 'px-3', 'py-1.5');

    rerender(
      <Button variant="accent">
        Continue
      </Button>,
    );
    expect(screen.getByRole('button')).toHaveClass('bg-brand-teal');
  });

  it('respects a custom type for form submissions', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit');
  });

  it('disables and marks the button busy while loading', () => {
    render(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('reports clicks only when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});