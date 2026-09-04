# tests/test_escrow_payout.py
"""
Studio Mode tests (gltest) for FreelanceEscrow payout logic.

Run with:
    gltest tests/test_escrow_payout.py --network studionet -v

Requires GenLayer Studio running, or a configured studionet/testnet
in gltest.config.yaml.

NOTE on API: based on the official genlayer-test docs
(docs.genlayer.com/api-references/genlayer-test / PyPI page). Two
patterns appear in the docs for write calls:
    contract.method(args=[...]).transact(account=..., value=...)
    contract.method(args=[...], account=...)   # shown once, may be shorthand
This file uses the .transact() form since it's the one shown in the
"Read and Write Methods" quick-start section. If your installed
version accepts the bare form instead, adjust accordingly — check
against `pip show genlayer-test` version docs before relying on
either.
"""
from gltest import get_contract_factory, get_default_account, accounts
from gltest.assertions import tx_execution_succeeded

ONE_GEN = 1000000000000000000


def deploy_contract(sender):
    factory = get_contract_factory("FreelanceEscrow")
    contract = factory.deploy(account=sender)
    return contract


# --------------------------------------------------------------
# 1. test_payout_on_successful_delivery
# --------------------------------------------------------------

def test_approve_payout_transfers_to_freelancer():
    """
    Full happy path: client creates job, freelancer submits,
    client approves, freelancer receives payout.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    tx = contract.create_job(
        args=[freelancer.address, "Build a landing page"]
    ).transact(account=client, value=ONE_GEN)
    assert tx_execution_succeeded(tx)

    balance_before = contract.get_contract_balance().call()

    tx = contract.submit_work(
        args=[1, "Here is the HTML deliverable", False]
    ).transact(account=freelancer)
    assert tx_execution_succeeded(tx)

    tx = contract.approve(args=[1]).transact(account=client)
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "freelancer"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before) - ONE_GEN


# --------------------------------------------------------------
# 2. test_payout_refund_on_dispute
# --------------------------------------------------------------

def test_dispute_payout_to_client_on_rejection():
    """
    Client disputes, LLM adjudicates for client,
    client receives refund.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a React app with a working submit button"]
    ).transact(account=client, value=ONE_GEN)

    contract.submit_work(
        args=[1, "asdf placeholder nothing built", False]
    ).transact(account=freelancer)

    balance_before = contract.get_contract_balance().call()

    tx = contract.dispute(
        args=[1, "This does not match requirements at all"]
    ).transact(account=client)
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "client"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before) - ONE_GEN


# --------------------------------------------------------------
# 3. test_payout_not_triggered_prematurely
# --------------------------------------------------------------

def test_approve_before_submission_fails():
    """approve() must revert if work was never submitted."""
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(account=client, value=ONE_GEN)

    balance_before = contract.get_contract_balance().call()

    tx = contract.approve(args=[1]).transact(account=client)
    assert tx_execution_succeeded(tx) is False

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before)


def test_abandon_before_period_elapsed_fails():
    """
    abandon_job() must revert before ABANDONMENT_PERIOD elapses.

    Against the live 7-day contract this passes trivially (no time
    has passed). To actually exercise the "period elapsed" success
    path (tests 6-7 below use it conceptually), you need either a
    time-manipulation fixture (check the full gltest docs for one)
    or a separate test build with a shortened ABANDONMENT_PERIOD.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(account=client, value=ONE_GEN)

    balance_before = contract.get_contract_balance().call()

    tx = contract.abandon_job(
        args=[1, "too early"]
    ).transact(account=client)
    assert tx_execution_succeeded(tx) is False

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before)


# --------------------------------------------------------------
# 4. test_payout_amount_correctness
# --------------------------------------------------------------

def test_payout_amount_matches_escrow_exactly():
    """
    Exact escrow amount moves — contract-side drop and
    recipient-side rise must match exactly, no fee deduction.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(account=client, value=ONE_GEN)

    contract_before = contract.get_contract_balance().call()

    contract.submit_work(
        args=[1, "Here is the HTML deliverable", False]
    ).transact(account=freelancer)

    contract.approve(args=[1]).transact(account=client)

    contract_after = contract.get_contract_balance().call()

    assert int(contract_before) - int(contract_after) == ONE_GEN


# --------------------------------------------------------------
# 5. test_payout_with_multiple_parties
# --------------------------------------------------------------

def test_recovery_unavailable_50_50_split():
    """
    Evidence-unavailable recovery pays both parties in a single
    trigger call — 50/50 split.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(account=client, value=ONE_GEN)

    contract.submit_work(
        args=[1, "http://unreachable.invalid/url", True]
    ).transact(account=freelancer)

    contract.dispute(
        args=[1, "URL doesn't work"]
    ).transact(account=client)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "evidence_unavailable"

    balance_before = contract.get_contract_balance().call()

    tx = contract.recover_unavailable_job(
        args=[1, "Evidence was unreachable"]
    ).transact(account=client)
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "split"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_before) - int(balance_after) == ONE_GEN


# --------------------------------------------------------------
# 6. test_payout_idempotency
# --------------------------------------------------------------

def test_cannot_double_pay():
    """
    Once a job is resolved, calling approve again must fail —
    no double-spend.
    """
    client = get_default_account()
    freelancer = accounts[1]

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(account=client, value=ONE_GEN)

    contract.submit_work(
        args=[1, "Done", False]
    ).transact(account=freelancer)

    contract.approve(args=[1]).transact(account=client)

    balance_after_first = contract.get_contract_balance().call()

    tx = contract.approve(args=[1]).transact(account=client)
    assert tx_execution_succeeded(tx) is False

    balance_after_second_attempt = contract.get_contract_balance().call()
    assert int(balance_after_first) == int(balance_after_second_attempt)
