import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ImageField, imageFileError } from './ImageField';

function jpegFile(name = 'chai.jpg', type = 'image/jpeg', size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function Harness({ initial = null }: { initial?: File | null }) {
  const [file, setFile] = useState<File | null>(initial);
  return (
    <>
      <ImageField
        inputLabel="Choose branch image"
        triggerLabel="Choose branch image…"
        file={file}
        onFileChange={setFile}
      />
      <p data-testid="selected">{file ? file.name : 'none'}</p>
    </>
  );
}

describe('ImageField', () => {
  it('shows the trigger label and no preview before a file is chosen', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: 'Choose branch image…' })).toBeInTheDocument();
    expect(screen.queryByTestId('image-field-preview')).not.toBeInTheDocument();
  });

  it('previews the chosen file immediately and reports the selection', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.upload(screen.getByLabelText('Choose branch image'), jpegFile());

    expect(screen.getByTestId('image-field-preview')).toBeInTheDocument();
    expect(screen.getByTestId('selected')).toHaveTextContent('chai.jpg');
    expect(screen.getByRole('button', { name: 'Selected: chai.jpg' })).toBeInTheDocument();
  });

  it('clears the selection and drops the preview', async () => {
    const user = userEvent.setup();
    render(<Harness initial={jpegFile()} />);

    expect(screen.getByTestId('image-field-preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));

    expect(screen.queryByTestId('image-field-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('selected')).toHaveTextContent('none');
  });

  it('only accepts JPEG, PNG and WebP inputs', () => {
    const input = render(<Harness />).container.querySelector('input[type="file"]');

    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
  });

  it('calls onFileChange with the chosen file', async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    render(
      <ImageField
        inputLabel="Choose product image"
        triggerLabel="Choose image…"
        file={null}
        onFileChange={onFileChange}
      />,
    );

    await user.upload(
      screen.getByLabelText('Choose product image'),
      jpegFile('biryani.png', 'image/png'),
    );

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0]).toBeInstanceOf(File);
  });
});

describe('imageFileError', () => {
  it('accepts JPEG, PNG and WebP', () => {
    expect(imageFileError(jpegFile('a.jpg', 'image/jpeg'))).toBeNull();
    expect(imageFileError(jpegFile('a.png', 'image/png'))).toBeNull();
    expect(imageFileError(jpegFile('a.webp', 'image/webp'))).toBeNull();
  });

  it('rejects anything else, including SVG', () => {
    expect(imageFileError(jpegFile('a.svg', 'image/svg+xml'))).toBe(
      'Choose a JPEG, PNG or WebP image.',
    );
  });

  it('rejects a file above 5 MB', () => {
    expect(imageFileError(jpegFile('big.png', 'image/png', 5 * 1024 * 1024 + 1))).toBe(
      'Image must be 5 MB or smaller.',
    );
  });

  it('accepts a file at exactly the 5 MB limit', () => {
    expect(imageFileError(jpegFile('max.png', 'image/png', 5 * 1024 * 1024))).toBeNull();
  });
});
