import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckboxField, SelectField, TextareaField, TextField } from './forms';

describe('TextField', () => {
  it('links the label to its input', () => {
    render(<TextField label="Full name" />);

    const input = screen.getByLabelText('Full name');
    expect(input).toBeInTheDocument();
  });

  it('marks the control required and announced when required', () => {
    const { container } = render(<TextField label="Full name" required />);

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toHaveAttribute('required');
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('*');
  });

  it('shows helper text and wires it as described-by', () => {
    render(<TextField label="Delivery radius" helper="In kilometres." />);

    const input = screen.getByLabelText('Delivery radius');
    expect(input).toHaveAttribute(
      'aria-describedby',
      expect.stringMatching(/-helper$/),
    );
    expect(screen.getByText('In kilometres.')).toBeInTheDocument();
  });

  it('surfaces an error on the control and in an alert', () => {
    render(<TextField label="Branch code" error="Code must be unique." />);

    const input = screen.getByLabelText('Branch code');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Code must be unique.');
  });
});

describe('SelectField', () => {
  it('links the label and renders options', () => {
    render(
      <SelectField label="Branch" defaultValue="br-1">
        <option value="br-1">Guntur</option>
        <option value="br-2">Hyderabad</option>
      </SelectField>,
    );

    const select = screen.getByLabelText('Branch');
    expect(select).toHaveValue('br-1');
    expect(within(select).getByText('Hyderabad')).toBeInTheDocument();
  });
});

describe('TextareaField', () => {
  it('links the label and keeps a placeholder', () => {
    render(<TextareaField label="Reject reason" placeholder="Explain briefly" />);

    const textarea = screen.getByLabelText('Reject reason');
    expect(textarea).toHaveAttribute('placeholder', 'Explain briefly');
  });
});

describe('CheckboxField', () => {
  it('links the label to the checkbox and renders a description', () => {
    render(<CheckboxField label="Cash received" description="Tick once handed over." />);

    const checkbox = screen.getByLabelText(/Cash received/);
    expect(checkbox).toHaveAttribute('type', 'checkbox');
    expect(screen.getByText('Tick once handed over.')).toBeInTheDocument();
  });

  it('reports errors for the checkbox', () => {
    render(<CheckboxField label="Accept terms" error="You must accept first." />);
    expect(screen.getByRole('alert')).toHaveTextContent('You must accept first.');
  });
});