import base64

from backend.accounts import decrypt, encrypt


def test_round_trip():
    secret = "SBXQ6Q5ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOP"
    assert decrypt(encrypt(secret)) == secret


def test_format_matches_the_node_server():
    # "iv.tag.body": 12-byte IV, 16-byte GCM tag, then the ciphertext, each standard base64.
    iv, tag, body = (base64.b64decode(p) for p in encrypt("hello").split("."))
    assert (len(iv), len(tag), len(body)) == (12, 16, 5)


def test_fresh_iv_each_time():
    assert encrypt("x") != encrypt("x")
