"""
WebSocket routing for Django Channels
Maps WebSocket URLs to consumer classes
"""

from django.urls import path
from api.consumers import (
    TaskConsumer,
    AgentConsumer,
    ThoughtLogConsumer,
    EpicUpdateConsumer
)

websocket_urlpatterns = [
    # Task updates WebSocket
    path('ws/tasks/', TaskConsumer.as_asgi()),
    
    # Agent status updates WebSocket
    path('ws/agents/', AgentConsumer.as_asgi()),
    
    # Epic updates WebSocket
    path('ws/epics/', EpicUpdateConsumer.as_asgi()),
    
    # Thought logs WebSocket
    path('ws/logs/', ThoughtLogConsumer.as_asgi()),
]
