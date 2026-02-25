from celery import shared_task
from django.utils import timezone
from .models import FileRecord, EncryptionKey, AuditLog
from django.db import transaction

@shared_task
def check_expired_files():
    now = timezone.now()
    expired_files = FileRecord.objects.filter(
        ttl_expiry__lte=now,
        status='active'
    )
    
    count = 0
    for file_record in expired_files:
        with transaction.atomic():
            # 1. Trigger key destruction
            try:
                key_record = EncryptionKey.objects.get(file=file_record)
                # Overwrite key in record (Simulation of memory override as best as DB allows)
                key_record.encrypted_key = b'\0' * len(key_record.encrypted_key)
                key_record.destroyed_flag = True
                key_record.save()
                
                # 2. Mark file status
                file_record.status = 'expired'
                file_record.save()
                
                # 3. Log event
                AuditLog.objects.create(
                    action_type='AUTO_KEY_DESTRUCTION',
                    file=file_record,
                    details=f"Key destroyed due to TTL expiration: {file_record.ttl_expiry}"
                )
                count += 1
            except EncryptionKey.DoesNotExist:
                file_record.status = 'expired'
                file_record.save()

    return f"Successfully processed {count} expired files."

@shared_task
def cleanup_emergency_tokens():
    # Cleanup expired emergency requests
    from .models import EmergencyRequest
    now = timezone.now()
    expired = EmergencyRequest.objects.filter(
        expires_at__lte=now,
        status='approved'
    ).update(status='expired')
    return f"Expired {expired} emergency requests."
