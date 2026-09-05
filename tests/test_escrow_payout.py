# tests/test_escrow_payout.py
from gltest import get_contract_factory, get_default_account, create_account
from gltest.assertions import tx_execution_succeeded
from genlayer_py.types.transactions import TransactionStatus

ONE_GEN = 1000000000000000000


def deploy_contract(sender):
    factory = get_contract_factory("FreelanceEscrow")
    contract = factory.deploy(
        account=sender, wait_transaction_status=TransactionStatus.FINALIZED
    )
    return contract


def test_approve_payout_transfers_to_freelancer():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    tx = contract.create_job(
        args=[freelancer.address, "Build a landing page"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx)

    balance_before = contract.get_contract_balance().call()

    tx = contract_as_freelancer.submit_work(
        args=[1, "Here is the HTML deliverable", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx)

    tx = contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "freelancer"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before) - ONE_GEN


def test_dispute_payout_to_client_on_rejection():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_job(
        args=[freelancer.address, "Build a React app with a working submit button"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_as_freelancer.submit_work(
        args=[1, "asdf placeholder nothing built", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    balance_before = contract.get_contract_balance().call()

    tx = contract.dispute(
        args=[1, "This does not match requirements at all"]
    ).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_retries=100,
        wait_interval=5000,
    )
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "client"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before) - ONE_GEN


def test_approve_before_submission_fails():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    balance_before = contract.get_contract_balance().call()

    tx = contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx) is False

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before)


def test_abandon_before_period_elapsed_fails():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    balance_before = contract.get_contract_balance().call()

    tx = contract.abandon_job(
        args=[1, "too early"]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)
    assert tx_execution_succeeded(tx) is False

    balance_after = contract.get_contract_balance().call()
    assert int(balance_after) == int(balance_before)


def test_payout_amount_matches_escrow_exactly():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_before = contract.get_contract_balance().call()

    contract_as_freelancer.submit_work(
        args=[1, "Here is the HTML deliverable", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    contract_after = contract.get_contract_balance().call()

    assert int(contract_before) - int(contract_after) == ONE_GEN


def test_recovery_unavailable_50_50_split():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_as_freelancer.submit_work(
        args=[1, "http://unreachable.invalid/url", True]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    contract.dispute(
        args=[1, "URL doesn't work"]
    ).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_retries=100,
        wait_interval=5000,
    )

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "evidence_unavailable"

    balance_before = contract.get_contract_balance().call()

    tx = contract.recover_unavailable_job(
        args=[1, "Evidence was unreachable"]
    ).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_retries=100,
        wait_interval=5000,
    )
    assert tx_execution_succeeded(tx)

    job = contract.get_job(args=[1]).call()
    assert job["status"] == "resolved"
    assert job["resolution"] == "split"

    balance_after = contract.get_contract_balance().call()
    assert int(balance_before) - int(balance_after) == ONE_GEN


def test_cannot_double_pay():
    client = get_default_account()
    freelancer = create_account()

    contract = deploy_contract(client)
    contract_as_freelancer = contract.connect(freelancer)

    contract.create_job(
        args=[freelancer.address, "Build a site"]
    ).transact(value=ONE_GEN, wait_transaction_status=TransactionStatus.FINALIZED)

    contract_as_freelancer.submit_work(
        args=[1, "Done", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )

    balance_after_first = contract.get_contract_balance().call()

    tx = contract.approve(args=[1]).transact(
        wait_transaction_status=TransactionStatus.FINALIZED
    )
    assert tx_execution_succeeded(tx) is False

    balance_after_second_attempt = contract.get_contract_balance().call()
    assert int(balance_after_first) == int(balance_after_second_attempt)
