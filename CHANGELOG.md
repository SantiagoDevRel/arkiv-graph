# Changelog

## 1.1.0

- Add bytes fields with deprecated compatibility aliases. Guard every source-map string and clarify release installation guidance.

> Historical version entries below are preserved as recorded; use README.md for the current release.

## 1.0.0 — release candidate

Breaking changes:
- Require `@arkiv-network/sdk ^1.0.0`; earlier SDK clients are unsupported.
- Rabdi is the default DB-Chain. Server reads require an access key or a configured client.
- SDK reads use `$` system metadata and typed schema columns, with ordered offset pagination instead of cursors.
- Creation uses schema values and `expiration`; binary content belongs in non-indexed `bytes()` columns.
- Visitor writes use the RPC configured in their wallet. Every write supplies explicit nonce, gas and gasPrice and checks the receipt.
- Writes estimate exact unsigned calldata at the chain head; gas is at least twice the estimate and never exceeds half the head block limit. Maintainer seeding uses bounded, resumable batches.
- Creation and extension targets respect Rabdi's maximum lifetime; permanent expiration is unsupported.

Graph/table builders still accept legacy plain inputs. Both views share directed relationship rules, preserve separate duplicate join entities, and mark absent endpoints as unresolved. The social seed is idempotent by owner/project/sample identifier.

This entry describes a candidate. It does not claim npm publication or production promotion. See `docs/release-1.0.0.md`.
