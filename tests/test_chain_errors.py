from backend.config import config
from backend.soroban import _explain_sim_error


def test_contract_errors_map_to_names_even_without_contract_id_in_message():
    e = _explain_sim_error("HostError: Error(Contract, #4)", config.settlement_contract_id)
    assert (e.code, e.message) == ("TooEarly", "Settlement contract rejected the call: TooEarly")
    assert _explain_sim_error("HostError: Error(Contract, #2)", config.settlement_contract_id).code == "AlreadyPaid"
    assert _explain_sim_error("HostError: Error(Contract, #5)", config.settlement_contract_id).code == "Paused"


def test_token_errors_are_not_mistaken_for_settlement_errors():
    # #10 from the USDC token contract = insufficient balance, not one of ours.
    e = _explain_sim_error("HostError: Error(Contract, #10) balance", "CUSDC")
    assert e.code == "InsufficientBalance"
