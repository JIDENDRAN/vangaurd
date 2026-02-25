from rest_framework import serializers
from .models import User, FileRecord, EmergencyRequest, AuditLog, EncryptionKey

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'mfa_enabled')

class FileRecordSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    
    class Meta:
        model = FileRecord
        fields = ('id', 'owner', 'filename', 'cloud_path', 'ttl_expiry', 'access_limit', 'access_count', 'status', 'created_at')

class EmergencyRequestSerializer(serializers.ModelSerializer):
    requested_by = UserSerializer(read_only=True)
    approved_by = UserSerializer(read_only=True)
    
    class Meta:
        model = EmergencyRequest
        fields = ('id', 'file', 'requested_by', 'approved_by', 'reason', 'timestamp', 'status', 'expires_at')

class AuditLogSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = AuditLog
        fields = ('id', 'user', 'action_type', 'file', 'ip_address', 'details', 'timestamp')
