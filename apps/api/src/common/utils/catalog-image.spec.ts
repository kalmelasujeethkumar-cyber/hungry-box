import { describe, expect, it } from 'vitest';
import { resolveCatalogImageUrl } from './catalog-image';

function image(overrides: Partial<{ imageUrl: string; isPrimary: boolean; sortOrder: number }> = {}) {
  return {
    imageUrl: 'https://cdn.example/default.jpg',
    isPrimary: false,
    sortOrder: 0,
    ...overrides,
  };
}

describe('resolveCatalogImageUrl', () => {
  it('prefers the primary branch image over everything else', () => {
    expect(
      resolveCatalogImageUrl({
        branchImages: [
          image({ imageUrl: 'https://cdn.example/branch-2.jpg', sortOrder: 1 }),
          image({ imageUrl: 'https://cdn.example/branch-1.jpg', sortOrder: 0, isPrimary: true }),
        ],
        globalImages: [image({ imageUrl: 'https://cdn.example/global.jpg', isPrimary: true })],
        categoryImageUrl: 'https://cdn.example/category.jpg',
      }),
    ).toBe('https://cdn.example/branch-1.jpg');
  });

  it('falls back to the global product image when the branch has none', () => {
    expect(
      resolveCatalogImageUrl({
        branchImages: [],
        globalImages: [image({ imageUrl: 'https://cdn.example/global.jpg', isPrimary: true })],
        categoryImageUrl: 'https://cdn.example/category.jpg',
      }),
    ).toBe('https://cdn.example/global.jpg');
  });

  it('falls back to the category image when neither branch nor product has media', () => {
    expect(
      resolveCatalogImageUrl({
        branchImages: [],
        globalImages: [],
        categoryImageUrl: 'https://cdn.example/category.jpg',
      }),
    ).toBe('https://cdn.example/category.jpg');
  });

  it('returns null so the client can render its own branded fallback', () => {
    expect(
      resolveCatalogImageUrl({ branchImages: [], globalImages: [], categoryImageUrl: null }),
    ).toBeNull();
  });

  it('uses the first image by sortOrder when no image is flagged primary', () => {
    expect(
      resolveCatalogImageUrl({
        branchImages: [
          image({ imageUrl: 'https://cdn.example/second.jpg', sortOrder: 1 }),
          image({ imageUrl: 'https://cdn.example/first.jpg', sortOrder: 0 }),
        ],
        globalImages: [image({ imageUrl: 'https://cdn.example/global.jpg', isPrimary: true })],
        categoryImageUrl: null,
      }),
    ).toBe('https://cdn.example/first.jpg');
  });
});
