from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import transaction
from django.http import HttpResponse, FileResponse
import io
import os
import datetime

from .models import User, FileRecord, EncryptionKey, EmergencyRequest, AuditLog
from .serializers import UserSerializer, FileRecordSerializer, EmergencyRequestSerializer, AuditLogSerializer
from .crypto_utils import (
    encrypt_file_data, decrypt_file_data, 
    encrypt_key_for_storage, decrypt_key_from_storage,
    split_key_shamir, reconstruct_key_shamir
)

class IsAdminOrCompliance(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['admin', 'compliance']

class FileViewSet(viewsets.ModelViewSet):
    queryset = FileRecord.objects.all()
    serializer_class = FileRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        if self.request.user.role in ['admin', 'compliance']:
            return FileRecord.objects.all()
        return FileRecord.objects.filter(owner=self.request.user)

    @transaction.atomic
    def create(self, request):
        file_obj = request.FILES.get('file')
        ttl_hours = int(request.data.get('ttl_hours', 24))
        access_limit = int(request.data.get('access_limit', 0))
        
        if not file_obj:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Encrypt file locally
        file_data = file_obj.read()
        ciphertext, data_key, file_nonce = encrypt_file_data(file_data)
        
        # 2. Upload ciphertext (Simulation: save to local media or DB for now)
        # In real AWS S3, you'd use boto3 here.
        # For this demo, we'll store it in a local 'storage' folder.
        storage_path = f"encrypted_storage/{file_obj.name}.enc"
        os.makedirs("encrypted_storage", exist_ok=True)
        with open(storage_path, "wb") as f:
            f.write(ciphertext)

        # 3. Create FileRecord
        file_record = FileRecord.objects.create(
            owner=request.user,
            filename=file_obj.name,
            cloud_path=storage_path,
            ttl_expiry=timezone.now() + datetime.timedelta(hours=ttl_hours),
            access_limit=access_limit,
            status='active'
        )

        # 4. Encrypt and store key + Shamir Shares
        encrypted_data_key, key_nonce = encrypt_key_for_storage(data_key)
        shares = split_key_shamir(data_key)
        
        EncryptionKey.objects.create(
            file=file_record,
            encrypted_key=encrypted_data_key,
            nonce=key_nonce,
            file_nonce=file_nonce, # Need to add this to model
            escrow_shares=shares
        )

        # 5. Log action
        AuditLog.objects.create(
            user=request.user,
            action_type='FILE_UPLOAD',
            file=file_record,
            ip_address=request.META.get('REMOTE_ADDR'),
            details=f"File {file_obj.name} uploaded and encrypted."
        )

        return Response(FileRecordSerializer(file_record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        file_record = self.get_object()
        
        # Check if user is owner or has an approved emergency request
        is_owner = file_record.owner == request.user
        has_emergency_access = EmergencyRequest.objects.filter(
            file=file_record,
            requested_by=request.user,
            status='approved',
            expires_at__gte=timezone.now()
        ).exists()

        if not (is_owner or has_emergency_access):
            return Response({"error": "Unauthorized access. Permanent record created."}, status=status.HTTP_403_FORBIDDEN)

        # Check status
        if file_record.status == 'destroyed':
            return Response({"error": "File protocol terminated. Key destroyed."}, status=status.HTTP_403_FORBIDDEN)

        if file_record.status == 'expired' and not has_emergency_access:
            return Response({"error": "File has expired. Emergency protocol required for recovery."}, status=status.HTTP_403_FORBIDDEN)

        # Check access limit (not applicable for emergency)
        if not has_emergency_access:
            if file_record.access_limit > 0 and file_record.access_count >= file_record.access_limit:
                return Response({"error": "Access limit exceeded."}, status=status.HTTP_403_FORBIDDEN)

        # Retrieve Key
        try:
            key_record = EncryptionKey.objects.get(file=file_record)
            if key_record.destroyed_flag:
                 return Response({"error": "Decryption key has been destroyed permanently."}, status=status.HTTP_403_FORBIDDEN)
            
            # If it's an emergency, we might use Shamir reconstruction here if the main key was 'soft-deleted'
            # But for this implementation, we'll decrypt from storage if not destroyed.
            data_key = decrypt_key_from_storage(key_record.encrypted_key, key_record.nonce)
            
            # Read ciphertext
            with open(file_record.cloud_path, "rb") as f:
                ciphertext = f.read()

            # Decrypted
            decrypted_data = decrypt_file_data(ciphertext, data_key, key_record.file_nonce)
            
            if decrypted_data is None:
                return Response({"error": "Decryption protocol failure."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Update access count
            file_record.access_count += 1
            file_record.save()

            # Log action
            AuditLog.objects.create(
                user=request.user,
                action_type='FILE_DOWNLOAD_SUCCESS',
                file=file_record,
                ip_address=request.META.get('REMOTE_ADDR'),
                details="Emergency override used" if has_emergency_access else "Standard access"
            )

            # Stream back
            response = HttpResponse(decrypted_data, content_type='application/octet-stream')
            response['Content-Disposition'] = f'attachment; filename="{file_record.filename}"'
            return response

        except Exception as e:
            return Response({"error": f"Internal system error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class MFAVerifyView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get('code')
        # In a real system, verify against Redis/DB
        if code == "123456": # Demo code
            request.user.mfa_enabled = True
            request.user.save()
            return Response({"status": "MFA verified and enabled"})
        return Response({"error": "Invalid verification code"}, status=status.HTTP_400_BAD_REQUEST)

class EmergencyRequestViewSet(viewsets.ModelViewSet):
    queryset = EmergencyRequest.objects.all()
    serializer_class = EmergencyRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def create(self, request):
        file_id = request.data.get('file_id')
        reason = request.data.get('reason')
        file_record = get_object_or_404(FileRecord, id=file_id)
        
        req = EmergencyRequest.objects.create(
            file=file_record,
            requested_by=request.user,
            reason=reason,
            status='pending'
        )
        
        AuditLog.objects.create(
            user=request.user,
            action_type='EMERGENCY_REQUEST_SUBMITTED',
            file=file_record,
            details=f"Reason: {reason}"
        )
        
        return Response(EmergencyRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrCompliance])
    def approve(self, request, pk=None):
        emergency_req = self.get_object()
        if emergency_req.status != 'pending':
            return Response({"error": "Request already processed."}, status=status.HTTP_400_BAD_REQUEST)

        emergency_req.status = 'approved'
        emergency_req.approved_by = request.user
        emergency_req.expires_at = timezone.now() + datetime.timedelta(minutes=30)
        emergency_req.save()

        AuditLog.objects.create(
            user=request.user,
            action_type='EMERGENCY_REQUEST_APPROVED',
            file=emergency_req.file,
            details=f"Approved by {request.user.username}"
        )

        return Response(EmergencyRequestSerializer(emergency_req).data)

class AuditLogView(APIView):
    permission_classes = [IsAdminOrCompliance]

    def get(self, request):
        logs = AuditLog.objects.all().order_by('-timestamp')
        serializer = AuditLogSerializer(logs, many=True)
        return Response(serializer.data)
