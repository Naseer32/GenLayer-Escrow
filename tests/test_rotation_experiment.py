from gltest import get_contract_factory, get_default_account, create_account
from genlayer_py.types.transactions import TransactionStatus


def test_rotation_experiment():
    client = get_default_account()
    freelancer = create_account()

    factory = get_contract_factory("FreelanceEscrow")
    contract = factory.deploy(
        account=client, wait_transaction_status=TransactionStatus.FINALIZED
    )

    contract.create_job(
        args=[freelancer.address, "Build a landing page"]
    ).transact(value=1000000000000000000, wait_transaction_status=TransactionStatus.FINALIZED)

    contract.connect(freelancer).submit_work(
        args=[1, "Bad placeholder work", False]
    ).transact(wait_transaction_status=TransactionStatus.FINALIZED)

    tx = contract.dispute(
        args=[1, "does not meet requirements"]
    ).transact(
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_retries=100,
        wait_interval=5000,
        consensus_max_rotations=5,
    )

    print("STATUS:", tx.get("status_name"))
    print("NUM ROUNDS:", tx.get("num_of_rounds"))
    print("LAST ROUND VALIDATORS:", tx.get("last_round", {}).get("round_validators"))
    print("ROTATION COUNT:", tx.get("last_round", {}).get("rotations_left"))
