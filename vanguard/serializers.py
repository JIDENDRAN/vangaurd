from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, FileRecord, EmergencyRequest, AuditLog, EncryptionKey

class VanguardTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['is_superuser'] = user.is_superuser
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['is_admin'] = self.user.role == 'admin' or self.user.is_superuser or self.user.is_staff
        data['is_superuser'] = self.user.is_superuser
        data['username'] = self.user.username
        return data


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'role', 'mfa_enabled', 'is_superuser')


class FileRecordSerializer(serializers.ModelSerializer):
    owner_username = serializers.CharField(source='owner.username', read_only=True)
    has_emergency_access = serializers.SerializerMethodField()

    class Meta:
        model = FileRecord
        fields = (
            'id', 'owner', 'owner_username',
            'filename', 'cloud_path',
            'ttl_expiry', 'access_limit', 'access_count',
            'status', 'created_at', 'has_emergency_access',
        )

    def get_has_emergency_access(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        
        from .models import EmergencyRequest
        from django.utils import timezone
        
        return EmergencyRequest.objects.filter(
            file=obj,
            requested_by=request.user,
            status='approved',
            expires_at__gte=timezone.now()
        ).exists()


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
    user_username = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            'id', 'user', 'user_username',
            'action_type',
            'file', 'file_name',
            'ip_address', 'details', 'timestamp',
        )

    def get_user_username(self, obj):
        return obj.user.username if obj.user else "DELETED_USER"

    def get_file_name(self, obj):
        return obj.file.filename if obj.file else "DELETED_FILE"
