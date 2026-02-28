import time
from django.core.management.base import BaseCommand
from vanguard.tasks import check_expired_files, cleanup_emergency_tokens

class Command(BaseCommand):
    help = 'Continuously checks for expired files and emergency tokens and processes their self-destruction.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS(
            "=========================================\n"
            "VANGUARD AUTO-DELETE PROTOCOL ONLINE\n"
            "Monitoring for expired TTLs in background\n"
            "========================================="
        ))
        
        while True:
            try:
                # Run the actual cleanup logic
                res1 = check_expired_files()
                res2 = cleanup_emergency_tokens()
                
                # Print only when it actually deleted something (count > 0)
                if not res1.endswith(" 0 expired files."):
                    self.stdout.write(self.style.WARNING(f"[AUTO-DELETE] {res1}"))
                if not res2.startswith("Expired 0"):
                    self.stdout.write(self.style.WARNING(f"[AUTO-CLEANUP] {res2}"))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error in auto-delete worker: {e}"))
                
            # Wait 10 seconds before checking again
            time.sleep(10)
