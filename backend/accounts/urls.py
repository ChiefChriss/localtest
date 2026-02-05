from django.urls import path
from .views import RegisterView, LoginView, ProtectedView, UserProfileView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('profile/', UserProfileView.as_view(), name='profile'),
    path('protected-endpoint/', ProtectedView.as_view(), name='protected-endpoint'),
]
