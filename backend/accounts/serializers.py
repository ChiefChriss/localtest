from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'profile_picture', 'is_creator', 'is_listener', 'creator_since', 'password')
        read_only_fields = ('creator_since',)
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        is_creator = validated_data.get('is_creator')
        if is_creator and not instance.is_creator:
            from django.utils import timezone
            instance.creator_since = timezone.now()
        
        return super().update(instance, validated_data)

