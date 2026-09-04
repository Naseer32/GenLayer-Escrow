# Payout Testing Evidence

This document records an end-to-end test of the escrow payout path
(`create_job` → `submit_work` → `approve`) on GenLayer Studionet,
demonstrating that `_pay()` performs a real native GEN transfer via
`emit_transfer()` — not just an internal state change.

Contract address: `0x6705628B24F9B2d99363a59FD7603dE716C6F332`
Network: Studionet
Date: September 4, 2026

## Test: Job 7 — Full Approve Payout Path

**Participants**
- Client: `0x53b20BeADADe01b46a3fb5bdbC85D3A7B0f12A96`
- Freelancer: `0x5E31205009bC47842DAb8534F7492823A4dE6b35`
- Escrow amount: 7 GEN

**Baseline balances (before test)**
| Account | Balance |
|---|---|
| Client wallet | 70 GEN |
| Freelancer wallet | 38 GEN |
| Contract balance | 10 GEN |

### Step 1 — `create_job`

- Tx hash: `0x4e95ea449de7239f61aae069a08219996603f438bcc2f61fcfde3e29c4eaf276`
- Status: **FINALIZED** (5 validators, Consensus Result: Accepted)
- Method: `create_job(freelancer, requirements)`
- Value sent: 7 GEN
- Return value: `7` (job ID — confirms 1-based job ID numbering)

**Result:**
| Account | Before | After |
|---|---|---|
| Client wallet | 70 GEN | 63 GEN |
| Contract balance | 10 GEN | 17 GEN |

### Step 2 — `submit_work`

- Tx hash: `0xe662687a3d2cfa4109c6fc79b33336c1e976c57520273b10c4f75821f0dc6092`
- Status: **FINALIZED** (5 validators, Consensus Result: Accepted)
- Method: `submit_work(7, "Here is the landing page HTML with a headline and CTA button.", false)`
- Sender: freelancer wallet
- Return value: `null` (expected — `submit_work` has no return type)

### Step 3 — `approve`

- Tx hash: `0x8ea0a8cc41bb4061d6af596f218beb012f389caacf73467cf79cce86350b6d46`
- Status: **FINALIZED** (5 validators, Consensus Result: Accepted)
- Method: `approve(7)`
- Sender: client wallet
- Return value: `null` (expected — `approve` has no return type; payout happens via `_pay()` side effect)

**Result:**
| Account | Before | After | Delta |
|---|---|---|---|
| Contract balance | 17 GEN | 10 GEN | −7 GEN |
| Freelancer wallet | 38 GEN | 45 GEN | +7 GEN |

## Conclusion

The contract balance dropped by exactly the escrow amount (7 GEN),
and the freelancer's wallet balance rose by the same amount,
confirming `_pay()` → `emit_transfer()` performs a genuine native
GEN transfer out of the contract to the recipient address — not
merely an internal accounting update. All three transactions
reached `FINALIZED` status with 5-validator consensus.

## Job ID Fix Confirmation

`create_job` returned job ID `7` directly (not `6`), confirming
job IDs are now 1-based as returned to callers, addressing the
previously reported zero-based job ID display bug.

## Test: Job 8 — Second Approve Payout (Bonus Confirmation)

**Escrow amount:** 5 GEN

- `create_job` tx: `0x08072bec6eaffea3da217e0d2da95d1dc35d5f2f77c81e4ca9d5a69cd60569a6` — FINALIZED, job ID `8` returned, contract balance 10→15 GEN
- `submit_work` tx: `0xd4f5b5dacca5ac1099b84f82cf171b5d6af9524e64e69ae3edae6b5a9278b475` — FINALIZED, URL deliverable submitted (unreachable `.invalid` domain), Equivalence Principle output `{"available":false,"digest":""}`, confirming validators independently agreed the URL was unfetchable and correctly left `deliverable_digest` empty
- `approve` tx: `0x77bb225a7b8e94158d4dbddfc1ec94145bfb83709982ffc13411c4f49e7164af` — FINALIZED

**Result:**
| Account | Before | After | Delta |
|---|---|---|---|
| Contract balance | 15 GEN | 10 GEN | −5 GEN |
| Freelancer wallet | 45 GEN | 50 GEN | +5 GEN |

This is a second independent confirmation of the native-transfer payout path, and additionally demonstrates that an unfetchable URL correctly pins an empty digest via multi-validator consensus rather than crashing or defaulting to unsafe behavior.

## Test: Job 9 — Evidence Unavailable Recovery (Deterministic 50/50 Split)

**Escrow amount:** 8 GEN

- `create_job` tx: `0x7399341ce1e4557003f2e485151de2b272d9504d66bac7d4fe983bf45ee828e2` — FINALIZED, job ID `9` returned, contract balance 10→18 GEN
- `submit_work` tx: `0xc7c7c393f60da76bad3e6aed701992820e15282b6e41af35f05dd64aea0718ad` — FINALIZED, unreachable URL submitted (`https://this-definitely-does-not-exist-99999.xyz/page.html`), Equivalence Principle output `{"available":false,"digest":""}` — no snapshot pinned at submission
- `dispute` tx: `0x1d21bab7cf732a5c8ba18d38bf203497d34d6eb1d8ca96a88712ee9e4db2710c` — FINALIZED, resolved to `status: "evidence_unavailable"` without adjudication, since no digest was ever pinned. Equivalence Principle output at dispute time again confirms `{"available":false,"content":"","digest":""}`
- `recover_unavailable_job` tx: `0x266388c0b9e1b3fec15e46e53e53d4d6678525d51c33528d514dc668440a3fd2` — FINALIZED, triggered the deterministic neutral 50/50 split

**Result:**
| Account | Before | After | Delta |
|---|---|---|---|
| Contract balance | 18 GEN | 10 GEN | −8 GEN |
| Client wallet | 50 GEN | 54 GEN | +4 GEN |
| Freelancer wallet | 50 GEN | 54 GEN | +4 GEN |

This confirms `recover_unavailable_job()` applies a genuinely deterministic neutral rule (no LLM adjudication) and correctly splits the escrow 50/50 via `emit_transfer()` to both parties when evidence cannot be verified.
