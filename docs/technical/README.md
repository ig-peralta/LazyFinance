# Technical evidence index

This directory documents **the current architecture and operational path alongside product quality goals**. It complements the [product requirements](../product-requirements.md) and the [dated planning snapshot](../planning/snapshots/backlog-2026-11-02.md), without treating a planned issue as delivered code.

- [Architecture](architecture.md): Angular/SSR, NestJS HTTP/MCP, identity, financial services, Drizzle and the neutral ingestion boundary.
- [Non-functional requirements](non-functional-requirements.md): product quality targets for ownership, privacy, financial correctness, ingestion, graceful degradation, performance, usability and reproducibility.
- [Environment examples](../../.env.example) and [API environment example](../../apps/api/.env.example): demo-only defaults and commented Firebase placeholders.
- [Technical manual](technical-manual.md): local setup, configuration, routes, Compose limitations, schema workflow and troubleshooting.

The source code and checked-in migrations take precedence if a diagram or guide becomes stale. Update this evidence alongside changes to the financial contracts, database schema, identity boundary, or deployment scripts.
