import secrets
from frappe.utils.password import encrypt,decrypt

class TokenService:
    """Handles secure token generation."""

    #dharshini
    @staticmethod
    def generate():
        """Generate a secure random token."""
        return secrets.token_urlsafe(32)
    @staticmethod
    def encrypt(token):
        return encrypt(token)
    @staticmethod
    def decrypt(encrypted_token):
        return decrypt(encrypted_token)