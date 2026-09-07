# tests/test_milestones.py
from gltest import get_contract_factory, get_default_account, create_account
from gltest.assertions import tx_execution_succeeded
from genlayer_py.types.transactions import TransactionStatus

TWO_GEN = 2000000000000000000
THREE_GEN = 3000000000000000000
FIVE_GEN = 5000000000000000000


def deploy_contract(sender):
    factory = get_contract_factory("FreelanceEscrow")
    contract = factory.deploy(
        account=sender, wait_transaction_status=TransactionStatus.FINALIZED
    )
    return contract


def test_milestone_partial_payouts():
    """
    Two-milestone job: each approve_milestone() releases only that
    milestone's amount, leaving the other locked until separately
    approved. Verifies both contract-side and recipient-side
    balance deltas at each step.
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

    job = contract.get_job(args=[1]).call()
    assert len(job["milestones"]) == 2
    assert job["milestones"][0]["status"] == "pending"
    assert job["milestones"][1]["status"] == "pending"

    balance_after_create = contract.get_contract_balance().call()
    assert int(balance_after_create) >= FIVE_GEN

    # --- Milestone 0 ---
    tx = contract_as_freelancer.submit_milestone(
        args=[1, 0, "Here is the design mockup"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx)

    balance_before_m0 = contract.get_contract_balance().call()

    tx = contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx)

    balance_after_m0 = contract.get_contract_balance().call()
    assert int(balance_before_m0) - int(balance_after_m0) == TWO_GEN

    job = contract.get_job(args=[1]).call()
    assert job["milestones"][0]["status"] == "resolved"
    assert job["milestones"][0]["resolution"] == "freelancer"
    assert job["milestones"][1]["status"] == "pending"  # untouched

    # --- Milestone 1 ---
    tx = contract_as_freelancer.submit_milestone(
        args=[1, 1, "Here is the built page"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx)

    balance_before_m1 = contract.get_contract_balance().call()

    tx = contract.approve_milestone(args=[1, 1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx)

    balance_after_m1 = contract.get_contract_balance().call()
    assert int(balance_before_m1) - int(balance_after_m1) == THREE_GEN

    job = contract.get_job(args=[1]).call()
    assert job["milestones"][0]["status"] == "resolved"
    assert job["milestones"][1]["status"] == "resolved"
    assert job["milestones"][1]["resolution"] == "freelancer"


def test_milestone_amounts_must_sum_to_value():
    """create_milestone_job must reject a value/amount mismatch."""
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)

    tx = contract.create_milestone_job(
        args=[
            freelancer.address,
            ["Design mockup", "Build the page"],
            [str(TWO_GEN), str(THREE_GEN)],
        ]
    ).transact(value=TWO_GEN, wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx) is False


def test_cannot_approve_milestone_before_submission():
    """approve_milestone must revert if that milestone was never submitted."""
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)

    contract.create_milestone_job(
        args=[
            freelancer.address,
            ["Design mockup", "Build the page"],
            [str(TWO_GEN), str(THREE_GEN)],
        ]
    ).transact(value=FIVE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    balance_before = contract.get_contract_balance().call()

    tx = contract.approve_milestone(args=[1, 0]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx) is False

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before)
