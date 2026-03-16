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
from django.db.models import Q
from .crypto_utils import (
    encrypt_file_data, decrypt_file_data, 
    encrypt_key_for_storage, decrypt_key_from_storage,
    split_key_shamir, reconstruct_key_shamir
)
from .s3_utils import upload_to_s3, download_from_s3
from django.conf import settings

class IsAdminOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'

class FileViewSet(viewsets.ModelViewSet):
    queryset = FileRecord.objects.all()
    serializer_class = FileRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Allow all authenticated users to see all files in the vault
        return FileRecord.objects.all()

    @transaction.atomic
    def create(self, request):
        if not (request.user.role == 'admin' or request.user.is_superuser):
             return Response({"error": "Unauthorized: Only administrators can upload files."}, status=status.HTTP_403_FORBIDDEN)

        file_obj = request.FILES.get('file')
        expire_at_str = request.data.get('expire_at')
        
        if not file_obj:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
             
        if not expire_at_str:
             return Response({"error": "No expiration date provided"}, status=status.HTTP_400_BAD_REQUEST)
             
        try:
            # Parse ISO datetime string from flatpickr
            expire_at = datetime.datetime.fromisoformat(expire_at_str.replace('Z', '+00:00'))
            if timezone.is_naive(expire_at):
                expire_at = timezone.make_aware(expire_at)
        except ValueError:
            return Response({"error": "Invalid expiration date format"}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Encrypt file locally
        file_data = file_obj.read()
        ciphertext, data_key, file_nonce = encrypt_file_data(file_data)
        
        # 2. Upload ciphertext
        storage_path = f"vanguard_vault/{file_obj.name}.enc"
        if settings.USE_S3:
            s3_path = upload_to_s3(ciphertext, storage_path)
            if not s3_path:
                return Response({"error": "Failed to upload to cloud storage."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            storage_location = s3_path
        else:
            local_dir = "encrypted_storage"
            os.makedirs(local_dir, exist_ok=True)
            local_path = os.path.join(local_dir, f"{file_obj.name}.enc")
            with open(local_path, "wb") as f:
                f.write(ciphertext)
            storage_location = local_path

        # 3. Create FileRecord
        file_record = FileRecord.objects.create(
            owner=request.user,
            filename=file_obj.name,
            cloud_path=storage_location,
            ttl_expiry=expire_at,
            access_limit=0, # Hardcoded infinite limit as requested
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
        
        # Shared Logic: Any authenticated user can access any file.
        # (Admins/Superusers still bypass expiry/limit checks below)
        request_user_is_admin = (request.user.role == 'admin' or request.user.is_superuser)
        
        has_emergency_access = EmergencyRequest.objects.filter(
            file=file_record,
            requested_by=request.user,
            status='approved',
            expires_at__gte=timezone.now()
        ).exists()

        # Check status
        if file_record.status == 'destroyed':
            return Response({"error": "File protocol terminated. Key destroyed."}, status=status.HTTP_403_FORBIDDEN)

        if file_record.status == 'expired' and not (has_emergency_access or request_user_is_admin):
            return Response({"error": "File has expired. Emergency protocol required for recovery."}, status=status.HTTP_403_FORBIDDEN)

        # Dynamic failsafe: If the background task missed it, still block download based on timestamp
        if file_record.ttl_expiry and file_record.ttl_expiry <= timezone.now() and not (has_emergency_access or request_user_is_admin):
            return Response({"error": "Time-to-live expired. Access denied."}, status=status.HTTP_403_FORBIDDEN)

        # Check access limit (not applicable for emergency)
        if not has_emergency_access:
            if file_record.access_limit > 0 and file_record.access_count >= file_record.access_limit:
                return Response({"error": "Access limit exceeded."}, status=status.HTTP_403_FORBIDDEN)

        # 2. Retrieve Key
        try:
            key_record = EncryptionKey.objects.get(file=file_record)
        except EncryptionKey.DoesNotExist:
            return Response({"error": "FILE PROTECTED BUT UNREADABLE: Encryption key has been permanently purged from the system."}, status=status.HTTP_403_FORBIDDEN)
            
        # 3. Decrypt Key and File Data
        try:
            
            # Ensure we are working with raw bytes
            enc_key = bytes(key_record.encrypted_key)
            nonce = bytes(key_record.nonce)
            file_nonce = bytes(key_record.file_nonce)
            
            try:
                data_key = decrypt_key_from_storage(enc_key, nonce)
            except ValueError as e:
                # 3a. FAILSAFE: Master key mismatch detected. Attempting Shamir Recovery from Escrow.
                shares = key_record.escrow_shares
                if shares and len(shares) >= 2:
                    try:
                         from .crypto_utils import reconstruct_key_shamir
                         data_key = reconstruct_key_shamir(shares)
                         # Log recovery event
                         AuditLog.objects.create(
                            user=request.user,
                            action_type='EMERGENCY_KEY_RECONSTRUCTION',
                            file=file_record,
                            details="Primary master key decryption failed (MAC Fail). Successfully recovered via Shamir Escrow Shares."
                         )
                    except Exception as recovery_err:
                         return Response({"error": f"Critical encryption failure: Primary key mismatch and escrow reconstruction failed ({str(recovery_err)})."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                else:
                    return Response({"error": "Encryption protocol mismatch (System MAC Fail) and no recovery shares available."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # 4. Decrypt actual file content
            # Determine if we should pull from S3 or local based on the path prefix
            if file_record.cloud_path.startswith('s3://'):
                # Extract key from s3://bucket/key
                s3_key = file_record.cloud_path.replace(f"s3://{settings.AWS_STORAGE_BUCKET_NAME}/", "")
                ciphertext = download_from_s3(s3_key)
            else:
                # Treat as local file path
                normalized_path = os.path.normpath(file_record.cloud_path)
                
                # If the path doesn't exist, try resolving it relative to BASE_DIR
                if not os.path.exists(normalized_path):
                    alt_path = os.path.join(settings.BASE_DIR, normalized_path)
                    if os.path.exists(alt_path):
                        normalized_path = alt_path
                
                if not os.path.exists(normalized_path):
                     return Response({"error": f"Encrypted payload missing from local storage ({file_record.filename})."}, status=status.HTTP_404_NOT_FOUND)
                
                with open(normalized_path, "rb") as f:
                    ciphertext = f.read()

            if ciphertext is None:
                return Response({"error": "Failed to retrieve encrypted payload from storage."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            decrypted_data = decrypt_file_data(ciphertext, data_key, file_nonce)
            
            if decrypted_data is None:
                AuditLog.objects.create(
                    user=request.user,
                    action_type='DECRYPTION_FAILED_FILE',
                    file=file_record,
                    details="File data decryption failed (Tag Mismatch)."
                )
                return Response({"error": "Decryption protocol failure. Payload integrity check failed."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Update access count
            file_record.access_count += 1
            file_record.save()

            # Log action
            AuditLog.objects.create(
                user=request.user,
                action_type='FILE_VIEW_SUCCESS',
                file=file_record,
                ip_address=request.META.get('REMOTE_ADDR'),
                details=f"SECURE VIEW: {'Emergency protocol override' if has_emergency_access else 'Standard session'}"
            )

            # Stream back
            import mimetypes
            content_type, _ = mimetypes.guess_type(file_record.filename)
            if not content_type:
                content_type = 'application/octet-stream'
            
            response = HttpResponse(decrypted_data, content_type=content_type)
            response['Content-Disposition'] = f'inline; filename="{file_record.filename}"'
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

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOnly])
    def approve(self, request, pk=None):
        emergency_req = self.get_object()
        if emergency_req.status != 'pending':
            return Response({"error": "Request already processed."}, status=status.HTTP_400_BAD_REQUEST)

        emergency_req.status = 'approved'
        emergency_req.approved_by = request.user
        emergency_req.expires_at = timezone.now() + datetime.timedelta(days=1)
        emergency_req.save()

        AuditLog.objects.create(
            user=request.user,
            action_type='EMERGENCY_REQUEST_APPROVED',
            file=emergency_req.file,
            details=f"Approved by {request.user.username}"
        )

        return Response(EmergencyRequestSerializer(emergency_req).data)

class AuditLogView(APIView):
    permission_classes = [IsAdminOnly]

    def get(self, request):
        logs = AuditLog.objects.all().order_by('-timestamp')
        serializer = AuditLogSerializer(logs, many=True)
        return Response(serializer.data)

class UserProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)
