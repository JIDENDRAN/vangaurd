import os
import io
from Crypto.Cipher import AES
from Crypto.Protocol.SecretSharing import Shamir
from Crypto.Random import get_random_bytes
from django.conf import settings
import base64

def get_master_key():
    # Ensure master key is 32 bytes for AES-256
    encoded_key = settings.MASTER_KEY.encode()
    if len(encoded_key) > 32:
        return encoded_key[:32]
    return encoded_key.ljust(32, b'\0')

def encrypt_file_data(data: bytes):
    """
    Encrypts data using a randomly generated 256-bit AES key.
    Returns: (ciphertext, key, nonce, salt)
    """
    key = get_random_bytes(32)
    cipher = AES.new(key, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(data)
    # We combine tag and ciphertext for easier handling
    full_ciphertext = tag + ciphertext
    return full_ciphertext, key, cipher.nonce

def decrypt_file_data(ciphertext: bytes, key: bytes, nonce: bytes):
    """
    Decrypts data using the provided key and nonce.
    """
    tag = ciphertext[:16]
    actual_ciphertext = ciphertext[16:]
    cipher = AES.new(key, AES.MODE_GCM, nonce=nonce)
    try:
        decrypted_data = cipher.decrypt_and_verify(actual_ciphertext, tag)
        return decrypted_data
    except (ValueError, KeyError) as e:
        print(f"Decryption failed: {e}")
        return None

def encrypt_key_for_storage(data_key: bytes):
    """
    Encrypts the file-specific key using the Master Key before storing in DB.
    """
    master_key = get_master_key()
    cipher = AES.new(master_key, AES.MODE_GCM)
    ciphertext, tag = cipher.encrypt_and_digest(data_key)
    return tag + ciphertext, cipher.nonce

def decrypt_key_from_storage(encrypted_key: bytes, nonce: bytes):
    """
    Decrypts the file-specific key using the Master Key.
    """
    master_key = get_master_key()
    tag = encrypted_key[:16]
    actual_ciphertext = encrypted_key[16:]
    cipher = AES.new(master_key, AES.MODE_GCM, nonce=nonce)
    return cipher.decrypt_and_verify(actual_ciphertext, tag)

def split_key_shamir(key: bytes, threshold: int = 2, total_shares: int = 3):
    """
    Splits a 32-byte key into Shamir secret shares.
    pycryptodome Shamir only supports 16-byte secrets, so we split the key
    into two 16-byte halves and Shamir-split each half separately.
    """
    half1 = key[:16]
    half2 = key[16:]

    shares1 = Shamir.split(threshold, total_shares, half1)
    shares2 = Shamir.split(threshold, total_shares, half2)

    serializable_shares = []
    for (idx, s1), (_, s2) in zip(shares1, shares2):
        serializable_shares.append({
            'index': idx,
            'share1': base64.b64encode(s1).decode('utf-8'),
            'share2': base64.b64encode(s2).decode('utf-8'),
        })
    return serializable_shares

def reconstruct_key_shamir(shares_data):
    """
    Reconstructs a 32-byte key from Shamir secret shares.
    shares_data should be a list of dicts with 'index', 'share1', 'share2' (base64)
    """
    shares1 = []
    shares2 = []
    for item in shares_data:
        shares1.append((item['index'], base64.b64decode(item['share1'])))
        shares2.append((item['index'], base64.b64decode(item['share2'])))
    half1 = Shamir.combine(shares1)
    half2 = Shamir.combine(shares2)
    return half1 + half2

