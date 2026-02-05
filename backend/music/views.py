from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Track, Like
from .serializers import TrackSerializer, LikeSerializer
from rest_framework.parsers import MultiPartParser, FormParser
from django.utils import timezone
from datetime import timedelta
from django.db.models import Q

class TrackListCreateView(generics.ListCreateAPIView):
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        # Return tracks belonging to the current user
        return Track.objects.filter(user=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        # Automatically set the user to the current authenticated user
        serializer.save(user=self.request.user)

class TrackDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def get_queryset(self):
        # Ensure users can only modify their own tracks
        return Track.objects.filter(user=self.request.user)


class FeedView(generics.ListAPIView):
    """Returns all tracks from all users for the home feed"""
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Track.objects.all().order_by('-created_at')


class SearchView(generics.ListAPIView):
    """Search tracks by title, genre, or username"""
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        query = self.request.query_params.get('q', '')
        if query:
            return Track.objects.filter(
                Q(title__icontains=query) |
                Q(genre__icontains=query) |
                Q(user__username__icontains=query)
            ).order_by('-created_at')
        return Track.objects.none()


class LikeToggleView(APIView):
    """Toggle like on a track"""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, track_id):
        try:
            track = Track.objects.get(id=track_id)
        except Track.DoesNotExist:
            return Response({'error': 'Track not found'}, status=status.HTTP_404_NOT_FOUND)

        like, created = Like.objects.get_or_create(user=request.user, track=track)
        
        if not created:
            # Already liked, so unlike
            like.delete()
            return Response({'liked': False, 'likes_count': track.likes.count()})
        
        return Response({'liked': True, 'likes_count': track.likes.count()})


class LikedTracksView(generics.ListAPIView):
    """Returns all tracks liked by the current user"""
    serializer_class = TrackSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Track.objects.filter(likes__user=self.request.user).order_by('-likes__created_at')
