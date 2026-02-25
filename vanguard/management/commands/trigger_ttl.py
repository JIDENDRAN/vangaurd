from django.core.management.base import BaseCommand
from vanguard.tasks import check_expired_files

class Command(BaseCommand):
    help = 'Triggers the TTL expiration check manually'

    def handle(self, *args, **options):
        self.stdout.write("Running TTL check...")
        result = check_expired_files()
        self.stdout.write(self.style.SUCCESS(result))
