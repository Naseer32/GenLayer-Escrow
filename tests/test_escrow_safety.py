# tests/test_escrow_safety.py
"""
Tests for the remaining_escrow tracking and route mutual-exclusion
fixes (v0.7.0). Run with:

    gltest tests/test_escrow_safety.py --network studionet -v

NOTE: test_partial_payout_then_timeout_refund requires
ABANDONMENT_PERIOD to be shortened for testing (e.g.
datetime.timedelta(minutes=2)) in a separate test deployment —
same approach used for the original abandon_job tests. Revert to
days=7 before deploying the version the live app points to.
"""
from gltest import get_contract_factory, get_default_account, create_account
from gltest.assertions import tx_execution_succeeded
from genlayer_py.types.transactions import TransactionStatus

TWO_GEN = 2000000000000000000
THREE_GEN = 3000000000000000000
FIVE_GEN = 5000000000000000000


def deploy_contract(sender):
    factory = get_contract_factory("FreelanceEscrow")
    return factory.deploy(
        account=sender, wait_transaction_status=TransactionStatus.FINALIZED
    )


# --------------------------------------------------------------
# 1. Partial payout followed by timeout refund
# --------------------------------------------------------------

def test_partial_payout_then_timeout_refund():
    """
    Approve one milestone (partial payout), then let the
    remaining milestone time out. abandon_milestone_job() must
    refund only the unclaimed remainder, not the full deposit.

    Requires a shortened ABANDONMENT_PERIOD test deployment.
    """
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    tx = contract.create_milestone_job(
        args=[
            freelancer.address,
            ["Design mockup", "Build the page"],
            [str(TWO_GEN), str(THREE_GEN)],
        ]
    ).transact(value=FIVE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx)

    # Approve milestone 0 only — partial payout.
    contract_as_freelancer.submit_milestone(
        args=[1, 0, "Here is the design mockup"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    job = contract.get_job(args=[1]).call()
    assert job["milestones"][0]["status"] == "resolved"
    assert int(job["remaining_escrow"]) == THREE_GEN

    # Wait out the (shortened, for this test build) abandonment
    # period, then claim the timeout refund on the remainder.
    import time
    time.sleep(150)  # adjust to match the test build's period

    balance_before = contract.get_contract_balance().call()

    tx = contract.abandon_milestone_job(
        args=[1, "milestone 1 never completed"]
    ).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_retries=100,
        wait_interval=5000,
    )
    assert tx_execution_succeeded(tx)

    balance_after = contract.get_contract_balance().call()
    # Only the remaining 3 GEN should have left the contract here —
    # not the full original 5 GEN (2 GEN already went out earlier).
    assert int(balance_before) - int(balance_after) == THREE_GEN

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert int(job["remaining_escrow"]) == 0


# --------------------------------------------------------------
# 2. Whole-job actions rejected on a milestone job, and vice versa
# --------------------------------------------------------------

def test_whole_job_actions_rejected_on_milestone_job():
    """
    submit_work/approve must refuse to run on a job created via
    create_milestone_job — the two payout routes must not mix.
    """
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_milestone_job(
        args=[
            freelancer.address,
            ["Design mockup", "Build the page"],
            [str(TWO_GEN), str(THREE_GEN)],
        ]
    ).transact(value=FIVE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    tx = contract_as_freelancer.submit_work(
        args=[1, "trying the whole-job path", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx) is False

    tx = contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx) is False


def test_milestone_actions_rejected_after_job_closed():
    """
    Once every milestone resolves, the job closes — no further
    milestone or whole-job action should succeed on it.
    """
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_milestone_job(
        args=[freelancer.address, ["Only milestone"], [str(TWO_GEN)]]
    ).transact(value=TWO_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_as_freelancer.submit_milestone(
        args=[1, 0, "done"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert int(job["remaining_escrow"]) == 0

    # Any further action on this job must be rejected.
    tx = contract_as_freelancer.submit_milestone(
        args=[1, 0, "trying again"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx) is False

    tx = contract.abandon_milestone_job(
        args=[1, "trying to reclaim after closure"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx) is False


# --------------------------------------------------------------
# 3. Total transfers never exceed the job's deposit
# --------------------------------------------------------------

def test_total_transfers_never_exceed_deposit():
    """
    Full milestone lifecycle: sum of all payouts for the job must
    equal exactly the original deposit, never more — verified via
    contract balance delta across both milestone payouts.
    """
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract_balance_before_job = contract.get_contract_balance().call()

    contract.create_milestone_job(
        args=[
            freelancer.address,
            ["Design mockup", "Build the page"],
            [str(TWO_GEN), str(THREE_GEN)],
        ]
    ).transact(value=FIVE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_as_freelancer.submit_milestone(
        args=[1, 0, "mockup"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    contract_as_freelancer.submit_milestone(
        args=[1, 1, "page"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    contract.approve_milestone(args=[1, 1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    contract_balance_after_job = contract.get_contract_balance().call()

    # Net effect on the contract for this job: +5 GEN in, -5 GEN
    # out across two payouts, back to the starting balance.
    assert int(contract_balance_after_job) == int(contract_balance_before_job)

    job = contract.get_job(args=[1]).call()
    assert int(job["remaining_escrow"]) == 0
    assert job["status"] == "resolved"

    # A further approve_milestone attempt must not pay out again.
    balance_before_extra_attempt = contract.get_contract_balance().call()

    tx = contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx) is False

    balance_after_extra_attempt = contract.get_contract_balance().call()
    assert int(balance_before_extra_attempt) == int(balance_after_extra_attempt)
