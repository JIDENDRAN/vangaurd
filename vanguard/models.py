from django.db import models
from django.contrib.auth.models import AbstractUser
import uuid

class User(AbstractUser):
    ROLE_CHOICES = (
        ('user', 'User'),
        ('admin', 'Admin'),
        ('compliance', 'Compliance Officer'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.CharField(max_length=32, blank=True, null=True)

    def __str__(self):
        return f"{self.username} ({self.get_role_display()})"

class FileRecord(models.Model):
    STATUS_CHOICES = (
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('destroyed', 'Destroyed'),
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='files')
    filename = models.CharField(max_length=255)
    cloud_path = models.CharField(max_length=512)
    ttl_expiry = models.DateTimeField()
    access_limit = models.IntegerField(default=0) # 0 means unlimited
    access_count = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.filename

class EncryptionKey(models.Model):
    file = models.OneToOneField(FileRecord, on_delete=models.CASCADE, related_name='key_data')
    encrypted_key = models.BinaryField() # AES key encrypted with master key
    nonce = models.BinaryField() # Nonce for encrypted_key
    file_nonce = models.BinaryField() # Nonce for the actual file ciphertext
    escrow_shares = models.JSONField(null=True, blank=True)
    destroyed_flag = models.BooleanField(default=False)
    salt = models.BinaryField(null=True, blank=True)

    def __str__(self):
        return f"Key for {self.file.filename}"

class EmergencyRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('expired', 'Expired'),
    )
    file = models.ForeignKey(FileRecord, on_delete=models.CASCADE)
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='emergency_requests')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_requests')
    reason = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Emergency Request for {self.file.filename} by {self.requested_by.username}"

class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action_type = models.CharField(max_length=100)
    file = models.ForeignKey(FileRecord, on_delete=models.SET_NULL, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.timestamp} - {self.user} - {self.action_type}"
