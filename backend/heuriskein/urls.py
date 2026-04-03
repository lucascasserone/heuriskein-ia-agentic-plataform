"""
URL configuration for heuriskein project.
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from api.views import (
    AgentViewSet, TaskViewSet, EpicViewSet, 
    HealthCheckAPIView, ChatAPIView,
    RegisterAPIView, LoginAPIView, UserDetailAPIView,
    ClarificationRequestViewSet, MetricsOverviewAPIView, MetricsTimeseriesAPIView
)

router = DefaultRouter()
router.register(r'agents', AgentViewSet, basename='agent')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'epics', EpicViewSet, basename='epic')
router.register(r'clarifications', ClarificationRequestViewSet, basename='clarification')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include(router.urls)),
    path('api/v1/health/', HealthCheckAPIView.as_view(), name='health'),
    path('api/v1/metrics/overview/', MetricsOverviewAPIView.as_view(), name='metrics-overview'),
    path('api/v1/metrics/timeseries/', MetricsTimeseriesAPIView.as_view(), name='metrics-timeseries'),
    path('api/v1/chat/', ChatAPIView.as_view(), name='chat'),
    path('api/v1/auth/register/', RegisterAPIView.as_view(), name='register'),
    path('api/v1/auth/login/', LoginAPIView.as_view(), name='login'),
    path('api/v1/auth/user/', UserDetailAPIView.as_view(), name='user-detail'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api-auth/', include('rest_framework.urls')),
]
