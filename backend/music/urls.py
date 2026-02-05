from django.urls import path
from .views import TrackListCreateView, TrackDetailView, FeedView, SearchView, LikeToggleView, LikedTracksView

urlpatterns = [
    path('tracks/', TrackListCreateView.as_view(), name='track-list-create'),
    path('tracks/<int:pk>/', TrackDetailView.as_view(), name='track-detail'),
    path('feed/', FeedView.as_view(), name='feed'),
    path('search/', SearchView.as_view(), name='search'),
    path('tracks/<int:track_id>/like/', LikeToggleView.as_view(), name='like-toggle'),
    path('liked/', LikedTracksView.as_view(), name='liked-tracks'),
]
