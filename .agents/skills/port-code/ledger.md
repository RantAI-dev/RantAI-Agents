# Port ledger: <old> to <new>

Reason and target number: <from the tracker>. Oracle: `<command>`. Base commit: `<hash>`.

Status is one of: todo, oracle ready, in progress, parity green, shadowed, cut over, old code deleted.

| Module (old path) | New path | Depends on | Case file | Cases | Status | Differences |
|---|---|---|---|---|---|---|
| `src/pricing/price-cart.ts` | `rust/crates/pricing/src/price.rs` | none | `cases/pricing.txt` | 412 | parity green | none |

Rules: a row moves to "parity green" only on the output of `scripts/check.sh`. Nobody ports a module
whose dependencies are not yet "parity green". No feature work lands in a module that is "in progress".
