from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileViewSet, EmergencyRequestViewSet, AuditLogView, MFAVerifyView
from .web_views import index_view
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = DefaultRouter()
router.register(r'files', FileViewSet)
router.register(r'emergency', EmergencyRequestViewSet)

urlpatterns = [
    path('', index_view, name='index'),
    path('api/', include(router.urls)),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/audit/', AuditLogView.as_view(), name='audit_logs'),
]
