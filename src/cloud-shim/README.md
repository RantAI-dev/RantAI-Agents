# Cloud Shim

No-op stubs for `@cloud/*` imports, letting OSS build standalone.

The cloud monorepo overrides these via its own tsconfig (`@cloud/*` → `apps/cloud/src/*`),
so OSS code can `import from "@cloud/..."` freely — OSS gets safe defaults, cloud gets
the real implementation.

**Rule:** When OSS code needs a cloud-specific feature, add a no-op shim here matching
the cloud path. Same import works in both builds.
