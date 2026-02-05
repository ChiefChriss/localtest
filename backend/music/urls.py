from django.urls import path
from .views import (
    TrackListCreateView, TrackDetailView, FeedView, SearchView, 
    LikeToggleView, LikedTracksView, TrackListenView,
    ProjectListCreateView, ProjectDetailView,
    ProjectFileUploadView, ProjectFileListView
)

urlpatterns = [
    path('tracks/', TrackListCreateView.as_view(), name='track-list-create'),
    path('tracks/<int:pk>/', TrackDetailView.as_view(), name='track-detail'),
    path('feed/', FeedView.as_view(), name='feed'),
    path('search/', SearchView.as_view(), name='search'),
    path('tracks/<int:track_id>/like/', LikeToggleView.as_view(), name='like-toggle'),
    path('tracks/<int:track_id>/listen/', TrackListenView.as_view(), name='track-listen'),
    path('liked/', LikedTracksView.as_view(), name='liked-tracks'),
    path('projects/', ProjectListCreateView.as_view(), name='project-list'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project-detail'),
    path('projects/<int:project_id>/files/', ProjectFileListView.as_view(), name='project-files'),
    path('projects/<int:project_id>/upload/', ProjectFileUploadView.as_view(), name='project-file-upload'),
]
