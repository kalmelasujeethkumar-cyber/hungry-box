import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notice } from './Notice';

describe('Notice', () => {
  it('renders the message and announces success as a status', () => {
    render(<Notice tone="success">Saved changes.</Notice>);

    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('Saved changes.');
    expect(notice).toHaveClass('border-emerald-200', 'text-emerald-800');
  });

  it('announces errors with the alert role', () => {
    render(<Notice tone="error">Something failed.</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something failed.');
  });

  it('renders an optional title', () => {
    render(
      <Notice tone="warning" title="Heads up">
        Delivery radius is large.
      </Notice>,
    );

    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Delivery radius is large.')).toBeInTheDocument();
  });

  it('defaults to the info tone', () => {
    render(<Notice>Tip</Notice>);
    expect(screen.getByRole('status')).toHaveClass('border-brand-sky');
  });
});