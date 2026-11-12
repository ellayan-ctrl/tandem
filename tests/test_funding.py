from backend.shared_data import fx_for, mask_details, validate_selection


def test_valid_canadian_bank():
    sel = {"providerId": "ca-rbc", "details": {"payerName": "Jane Doe", "transit": "12345", "institution": "003", "accountNumber": "1234567"}}
    assert validate_selection("Canada", sel) is None


def test_missing_and_invalid_fields():
    assert "required" in validate_selection("Canada", {"providerId": "ca-rbc", "details": {}})
    bad = {"providerId": "ca-rbc", "details": {"payerName": "Jane Doe", "transit": "12", "institution": "003", "accountNumber": "1234567"}}
    assert "looks invalid" in validate_selection("Canada", bad)
    assert "not available" in validate_selection("Kenya", {"providerId": "ca-rbc", "details": {}})
    assert validate_selection("Canada", None) == "Choose how you will pay in the matched amount."


def test_accented_names_match_like_javascript():
    sel = {"providerId": "ke-mpesa", "details": {"phone": "+254712345678", "payerName": "Zoë Wanjirú"}}
    assert validate_selection("Kenya", sel) is None


def test_masking_hides_sensitive_values_only():
    m = mask_details("Canada", {"providerId": "ca-rbc", "details": {"payerName": "Jane Doe", "accountNumber": "1234567"}})
    assert m == {"payerName": "Jane Doe", "accountNumber": "••••4567"}
    e = mask_details("Canada", {"providerId": "ca-interac", "details": {"contact": "jane@example.com"}})
    assert e["contact"] == "j••••@example.com"


def test_fx_for():
    assert fx_for("Canada") == ("CAD", 1.392)
    assert fx_for("Atlantis") == ("USD", 1)
