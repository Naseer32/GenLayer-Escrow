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
