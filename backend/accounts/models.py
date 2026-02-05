from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    profile_picture = models.ImageField(upload_to='profile_pics/', blank=True, null=True)
    is_creator = models.BooleanField(default=False)
    is_listener = models.BooleanField(default=True)
    creator_since = models.DateTimeField(null=True, blank=True)

