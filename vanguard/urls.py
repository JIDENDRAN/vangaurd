from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileViewSet, EmergencyRequestViewSet, AuditLogView, MFAVerifyView
from .web_views import index_view, dashboard_view, vault_view, emergency_view, audit_view
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

router = DefaultRouter()
router.register(r'files', FileViewSet)
router.register(r'emergency', EmergencyRequestViewSet)

urlpatterns = [
    # Web Pages
    path('', index_view, name='index'),
    path('dashboard/', dashboard_view, name='dashboard'),
    path('vault/', vault_view, name='vault'),
    path('emergency/', emergency_view, name='emergency'),
    path('audit/', audit_view, name='audit'),

    # API Endpoints
    path('api/', include(router.urls)),
    path('api/auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/audit/', AuditLogView.as_view(), name='audit_logs'),
    path('api/mfa/verify/', MFAVerifyView.as_view(), name='mfa_verify'),
]
