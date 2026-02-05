from rest_framework import serializers
from .models import Track, Like

class TrackSerializer(serializers.ModelSerializer):
    user = serializers.ReadOnlyField(source='user.username')
    user_id = serializers.ReadOnlyField(source='user.id')
    user_profile_picture = serializers.SerializerMethodField()
    likes_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    reposts_count = serializers.SerializerMethodField()
    is_reposted = serializers.SerializerMethodField()

    class Meta:
        model = Track
        fields = ['id', 'user', 'user_id', 'user_profile_picture', 'title', 'audio_file', 'cover_art', 'genre', 'bpm', 'duration', 'listens_count', 'created_at', 'likes_count', 'is_liked', 'reposts_count', 'is_reposted']
        read_only_fields = ['created_at', 'listens_count']

    def get_user_profile_picture(self, obj):
        if obj.user.profile_picture:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.user.profile_picture.url)
        return None

    def get_likes_count(self, obj):
        return obj.likes.count()

    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(user=request.user).exists()
        return False

    def get_reposts_count(self, obj):
        return obj.reposts.count()

    def get_is_reposted(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.reposts.filter(user=request.user).exists()
        return False


class LikeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Like
        fields = ['id', 'user', 'track', 'created_at']
        read_only_fields = ['user', 'created_at']
