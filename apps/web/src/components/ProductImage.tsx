import { useState } from 'react';

export interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  fallback?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  lazy?: boolean;
}

export function ProductImage({
  src,
  alt,
  fallback,
  className = 'h-full w-full',
  imgClassName = 'h-full w-full object-cover',
  fallbackClassName = 'text-3xl',
  lazy = true,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  if (showImage) {
    return (
      <img
        src={src as string}
        alt={alt}
        loading={lazy ? 'lazy' : undefined}
        onError={() => setFailed(true)}
        className={imgClassName}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={alt}
      className={[
        'flex items-center justify-center bg-brand-sky font-black text-brand-teal',
        className,
        fallbackClassName,
      ].join(' ')}
    >
      {fallback ?? alt.charAt(0).toUpperCase()}
    </span>
  );
}