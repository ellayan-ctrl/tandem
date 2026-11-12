import pytest

from backend.amounts import format_units, js_round, to_units


@pytest.mark.parametrize("bad", ["-1", "1e3", "0.12345678", "", "abc", " 1.2.3"])
def test_to_units_rejects_junk_and_excess_precision(bad):
    with pytest.raises(ValueError):
        to_units(bad)


def test_to_units_parses_exactly():
    assert to_units("0.1234567") == 1234567
    assert to_units("12.5") == 125_000_000
    assert to_units(10) == 100_000_000
    assert to_units(0.5) == 5_000_000
    assert to_units("1.50000000") == 15_000_000  # trailing zeros beyond 7 dp are fine


def test_format_units_round_trips():
    for s in ["0", "1", "0.0000001", "12.5", "1000000"]:
        assert format_units(to_units(s)) == s


def test_js_round_is_half_up_like_javascript():
    assert js_round(0.5) == 1
    assert js_round(2.5) == 3  # Python's round() gives 2
    assert js_round(-0.5) == 0
