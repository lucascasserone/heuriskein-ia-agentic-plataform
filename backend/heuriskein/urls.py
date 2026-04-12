"""
URL configuration for heuriskein project.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from api.views import (
    AgentViewSet, AgentMessageViewSet, TaskViewSet, EpicViewSet, SubtaskViewSet,
    CorporateDocumentViewSet, CorporateMemoryEntryViewSet, WorkflowPlaybookViewSet, WorkflowRunViewSet,
    HealthCheckAPIView, ChatAPIView,
    RegisterAPIView, LoginAPIView, UserDetailAPIView,
    ClarificationRequestViewSet, MetricsOverviewAPIView, MetricsTimeseriesAPIView, ExecutiveDashboardAPIView,
    AgentProvidersAPIView, ProviderCredentialsStatusAPIView, ProviderCredentialsUpsertAPIView,
)
from api.autonomous_org import (
    OrgCapabilitiesSummaryAPIView,
    OrgMissionStatsAPIView,
    OrgHireAPIView,
    OrgMissionAPIView,
    OrgStateAPIView,
    OrgFeasibilityAPIView,
    OrgTemplateAPIView,
)

router = DefaultRouter()
router.register(r'agents', AgentViewSet, basename='agent')
router.register(r'agent-messages', AgentMessageViewSet, basename='agent-message')
router.register(r'tasks', TaskViewSet, basename='task')
router.register(r'epics', EpicViewSet, basename='epic')
router.register(r'subtasks', SubtaskViewSet, basename='subtask')
router.register(r'clarifications', ClarificationRequestViewSet, basename='clarification')
router.register(r'corporate-documents', CorporateDocumentViewSet, basename='corporate-document')
router.register(r'corporate-memory', CorporateMemoryEntryViewSet, basename='corporate-memory')
router.register(r'workflow-playbooks', WorkflowPlaybookViewSet, basename='workflow-playbook')
router.register(r'workflow-runs', WorkflowRunViewSet, basename='workflow-run')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include(router.urls)),
    path('api/v1/health/', HealthCheckAPIView.as_view(), name='health'),
    path('api/v1/metrics/overview/', MetricsOverviewAPIView.as_view(), name='metrics-overview'),
    path('api/v1/metrics/timeseries/', MetricsTimeseriesAPIView.as_view(), name='metrics-timeseries'),
    path('api/v1/metrics/executive/', ExecutiveDashboardAPIView.as_view(), name='metrics-executive'),
    path('api/v1/agents/providers/', AgentProvidersAPIView.as_view(), name='agent-providers'),
    path('api/v1/agents/credentials/status/', ProviderCredentialsStatusAPIView.as_view(), name='agent-credentials-status'),
    path('api/v1/agents/credentials/', ProviderCredentialsUpsertAPIView.as_view(), name='agent-credentials-upsert'),
    path('api/v1/chat/', ChatAPIView.as_view(), name='chat'),
    path('api/v1/org/agents/hire/', OrgHireAPIView.as_view(), name='org-hire-agent'),
    path('api/v1/org/agents/template/', OrgTemplateAPIView.as_view(), name='org-agent-template'),
    path('api/v1/org/mission/execute/', OrgMissionAPIView.as_view(), name='org-run-mission'),
    path('api/v1/org/mission/feasibility/', OrgFeasibilityAPIView.as_view(), name='org-mission-feasibility'),
    path('api/v1/org/mission/stats/', OrgMissionStatsAPIView.as_view(), name='org-mission-stats'),
    path('api/v1/org/capabilities/summary/', OrgCapabilitiesSummaryAPIView.as_view(), name='org-capabilities-summary'),
    path('api/v1/org/state/', OrgStateAPIView.as_view(), name='org-state'),
    path('api/v1/auth/register/', RegisterAPIView.as_view(), name='register'),
    path('api/v1/auth/login/', LoginAPIView.as_view(), name='login'),
    path('api/v1/auth/user/', UserDetailAPIView.as_view(), name='user-detail'),
    path('api/v1/auth/refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('api-auth/', include('rest_framework.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
