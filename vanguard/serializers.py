from rest_framework import serializers
from .models import User, FileRecord, EmergencyRequest, AuditLog, EncryptionKey


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'mfa_enabled')


class FileRecordSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)

    class Meta:
        model = FileRecord
        fields = (
            'id', 'owner', 'owner_username',
            'filename', 'cloud_path',
            'ttl_expiry', 'access_limit', 'access_count',
            'status', 'created_at',
        )


class EmergencyRequestSerializer(serializers.ModelSerializer):
    requested_by_username = serializers.CharField(source='requested_by.username', read_only=True)
    approved_by_username  = serializers.CharField(source='approved_by.username',  read_only=True, default=None)
    file_name             = serializers.CharField(source='file.filename', read_only=True)

    class Meta:
        model = EmergencyRequest
        fields = (
            'id', 'file', 'file_name',
            'requested_by', 'requested_by_username',
            'approved_by',  'approved_by_username',
            'reason', 'timestamp', 'status', 'expires_at',
        )


class AuditLogSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True, default=None)
    file_name     = serializers.CharField(source='file.filename', read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = (
            'id', 'user', 'user_username',
            'action_type',
            'file', 'file_name',
            'ip_address', 'details', 'timestamp',
        )
