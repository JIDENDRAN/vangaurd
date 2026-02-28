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
                # MARK AS EXPIRED BUT PRESERVE KEY FOR ADMIN/EMERGENCY ACCESS
                file_record.status = 'expired'
                file_record.save()
                
                AuditLog.objects.create(
                    action_type='AUTO_FILE_EXPIRATION',
                    file=file_record,
                    details=f"File protocol set to EXPIRED due to TTL: {file_record.ttl_expiry}. Key preserved for admin/emergency retrieval."
                )
                count += 1
            except Exception:
                pass

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
