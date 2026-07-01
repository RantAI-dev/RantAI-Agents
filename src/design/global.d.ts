// React 18 -> 19 type shim (foundation-level, no feature files touched).
//
// React 19's @types/react removed the ambient *global* `JSX` namespace; it now
// lives under `React.JSX`. The ported open-design SPA still references
// `JSX.Element` (and friends) in a handful of places. Rather than rewriting
// each call site, we restore the global namespace here by aliasing it back to
// React's own JSX namespace. This is scoped to the isolated design tsconfig.
//
// Note: with `jsx: react-jsx` the intrinsic-element checks resolve through the
// jsxImportSource (`React.JSX`), so this shim only serves the explicit
// `JSX.*` references in the source.

import type * as React from 'react';

declare global {
  namespace JSX {
    type ElementType = React.JSX.ElementType;
    interface Element extends React.JSX.Element {}
    interface ElementClass extends React.JSX.ElementClass {}
    interface ElementAttributesProperty extends React.JSX.ElementAttributesProperty {}
    interface ElementChildrenAttribute extends React.JSX.ElementChildrenAttribute {}
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    interface IntrinsicAttributes extends React.JSX.IntrinsicAttributes {}
    interface IntrinsicClassAttributes<T> extends React.JSX.IntrinsicClassAttributes<T> {}
    interface IntrinsicElements extends React.JSX.IntrinsicElements {}
  }
}
