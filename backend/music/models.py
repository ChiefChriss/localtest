from django.db import models
from django.conf import settings

class Track(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tracks')
    title = models.CharField(max_length=255)
    audio_file = models.FileField(upload_to='tracks/')
    cover_art = models.ImageField(upload_to='cover_arts/', blank=True, null=True)
    genre = models.CharField(max_length=100, blank=True)
    bpm = models.IntegerField(null=True, blank=True)
    duration = models.FloatField(null=True, blank=True, help_text="Duration in seconds")
    listens_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} by {self.user.username}"


class Like(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='likes')
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name='likes')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username} likes {self.track.title}"


class Repost(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='reposts')
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name='reposts')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'track')

    def __str__(self):
        return f"{self.user.username} reposted {self.track.title}"


class Project(models.Model):
    """
    Stores the DAW project state for a linear timeline-based arrangement.
    The arrangement_json stores the layout of tracks and clips.
    Structure: { "tracks": [ { "id": "1", "name": "Vocals", "isMuted": false, "clips": [...] } ] }
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='projects')
    title = models.CharField(max_length=255, default="Untitled Project")
    bpm = models.IntegerField(default=120)
    # Stores the layout: "Track 1 has a clip at 3.5 seconds"
    arrangement_json = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Project: {self.title} by {self.user.username}"


class ProjectFile(models.Model):
    """
    Stores the actual raw audio files (blobs) for vocals/recordings.
    The 'arrangement_json' in Project will reference these files by their ID or URL.
    """
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='audio_files')
    name = models.CharField(max_length=255, default="Recording")
    file = models.FileField(upload_to='project_stems/')
    duration = models.FloatField(null=True, blank=True, help_text="Duration in seconds")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} - {self.project.title}"
