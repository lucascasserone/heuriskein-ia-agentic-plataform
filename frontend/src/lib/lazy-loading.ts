import dynamic from 'next/dynamic';
import React from 'react';

/**
 * Create a lazy-loaded component with loading fallback
 * Use this for heavy components to reduce initial bundle
 */
export function createLazyComponent<P extends object>(
  importFunc: () => Promise<{ default: React.ComponentType<P> }>,
  options?: {
    ssr?: boolean;
  }
) {
  return dynamic(() => importFunc(), {
    ssr: options?.ssr ?? true,
    loading: () => React.createElement('div', { className: 'flex items-center justify-center p-8 text-gray-400' }, 'Carregando...'),
  }) as React.ComponentType<P>;
}

/**
 * Lazy load a list of components at once
 */
export function createLazyComponents<P extends Record<string, object>>(
  imports: Record<keyof P, () => Promise<{ default: React.ComponentType<any> }>>,
  options?: {
    ssr?: boolean;
  }
) {
  const result: Record<string, React.ComponentType<any>> = {};

  for (const [key, importFunc] of Object.entries(imports)) {
    result[key] = createLazyComponent(importFunc, options);
  }

  return result as Record<keyof P, React.ComponentType<any>>;
}

/**
 * Suspense wrapper with fallback
 */
export function withSuspense<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  const Wrapped = (props: P) => 
    React.createElement(
      React.Suspense,
      { fallback: fallback || React.createElement('div', { className: 'h-12 bg-gray-200 animate-pulse rounded' }) },
      React.createElement(Component, props)
    );

  Wrapped.displayName = `WithSuspense(${Component.displayName || Component.name || 'Component'})`;

  return Wrapped;
}

/**
 * Lazy load content based on intersection observer (viewport visibility)
 */
export function useLazyLoad(ref: React.RefObject<HTMLElement>) {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current);
      }
    };
  }, [ref]);

  return isVisible;
}

/**
 * Lazy load images with blur-up effect
 */
export const LazyImage = React.forwardRef<
  HTMLImageElement,
  React.ImgHTMLAttributes<HTMLImageElement> & { blurDataUrl?: string }
>(({ blurDataUrl, ...props }, ref) => {
  const [isLoaded, setIsLoaded] = React.useState(false);

  return React.createElement('img', {
    ref,
    ...props,
    onLoad: () => setIsLoaded(true),
    className: `transition-opacity duration-300 ${
      isLoaded ? 'opacity-100' : 'opacity-50'
    } ${props.className || ''}`,
    style: {
      backgroundImage: blurDataUrl ? `url(${blurDataUrl})` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      ...props.style,
    },
  });
});

LazyImage.displayName = 'LazyImage';

export default {
  createLazyComponent,
  createLazyComponents,
  withSuspense,
  useLazyLoad,
  LazyImage,
};
