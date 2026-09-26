export interface CatalogImageCandidate {
  imageUrl: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface CatalogImageSources {
  branchImages: readonly CatalogImageCandidate[];
  globalImages: readonly CatalogImageCandidate[];
  categoryImageUrl: string | null;
}

function pickImage(candidates: readonly CatalogImageCandidate[]): CatalogImageCandidate | null {
  const ordered = [...candidates].sort((left, right) => left.sortOrder - right.sortOrder);
  return ordered.find((candidate) => candidate.isPrimary) ?? ordered[0] ?? null;
}

/**
 * The single canonical rule for which image represents a product in a given branch.
 * Branch-owned media always wins, then the global product image, then the category
 * image, and finally the client's own branded fallback. Every consumer (public
 * catalogue and branch management) must resolve through this function so the
 * customer-facing image and the manager-facing image can never disagree.
 */
export function resolveCatalogImageUrl(sources: CatalogImageSources): string | null {
  return (
    pickImage(sources.branchImages)?.imageUrl ??
    pickImage(sources.globalImages)?.imageUrl ??
    sources.categoryImageUrl ??
    null
  );
}
