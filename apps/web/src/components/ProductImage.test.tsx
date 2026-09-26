import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from './ProductImage';

describe('ProductImage', () => {
  it('renders the image lazily with its alt text', () => {
    render(<ProductImage src="https://cdn.example.com/biryani.jpg" alt="Chicken Biryani" />);

    const image = screen.getByAltText('Chicken Biryani') as HTMLImageElement;
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/biryani.jpg');
    expect(image).toHaveAttribute('loading', 'lazy');
  });

  it('omits the loading hint when lazy load is disabled', () => {
    render(<ProductImage src="hero.jpg" alt="Biryani" lazy={false} />);
    expect(screen.getByAltText('Biryani')).not.toHaveAttribute('loading');
  });

  it('shows a letter fallback when the image is missing', () => {
    render(<ProductImage src={null} alt="Chicken Biryani" />);

    const fallback = screen.getByRole('img', { name: 'Chicken Biryani' });
    expect(fallback).toHaveTextContent('C');
  });

  it('prefers the supplied fallback text over the initial', () => {
    render(<ProductImage src={null} alt="Paneer Roll" fallback="PR" />);
    expect(screen.getByRole('img', { name: 'Paneer Roll' })).toHaveTextContent('PR');
  });

  it('switches to the fallback when the image fails to load', () => {
    render(<ProductImage src="broken.jpg" alt="Idli" />);

    fireEvent.error(screen.getByAltText('Idli'));
    expect(screen.getByRole('img', { name: 'Idli' })).toHaveTextContent('I');
  });
});