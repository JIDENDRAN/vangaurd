from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import (
    FileViewSet, EmergencyRequestViewSet, AuditLogView, MFAVerifyView, 
    UserProfileView, UserListView, CreateUserView
)
from .web_views import (
    index_view, dashboard_view, vault_view, emergency_view, audit_view,
    users_view, settings_view
)
from .serializers import VanguardTokenObtainPairSerializer

class VanguardTokenObtainPairView(TokenObtainPairView):
    serializer_class = VanguardTokenObtainPairSerializer

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
    path('users/', users_view, name='users'),
    path('settings/', settings_view, name='settings'),

    # API Endpoints
    path('api/', include(router.urls)),
    path('api/auth/login/', VanguardTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/me/', UserProfileView.as_view(), name='user_profile'),
    path('api/auth/users/', UserListView.as_view(), name='user_list'),
    path('api/auth/users/create/', CreateUserView.as_view(), name='user_create'),
    path('api/audit/', AuditLogView.as_view(), name='audit_logs'),
    path('api/mfa/verify/', MFAVerifyView.as_view(), name='mfa_verify'),
]
