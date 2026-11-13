//! Postgres access with `sqlx`. Prisma owns the schema and migrations
//! (`prisma/schema.prisma`); this crate reads and writes the same tables and never migrates.
