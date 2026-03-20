class NotificationManager {
  constructor() {
    this.fcmToken = null;
    this.permission = 'default';
    this.init();
  }

  async init() {
    try {
      await this.requestPermission();
      await this.initializeFCM();
      this.setupForegroundMessageHandler();
      console.log('Notification system initialized');
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  }

  async requestPermission() {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      this.permission = 'granted';
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === 'granted';
    }

    this.permission = 'denied';
    return false;
  }

  async initializeFCM() {
    try {
      // Check if service worker is supported
      if (!('serviceWorker' in navigator)) {
        console.log('Service workers not supported');
        return;
      }

      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered:', registration);

      // Initialize FCM (mock implementation - in real app, use Firebase SDK)
      await this.initializeMockFCM(registration);
    } catch (error) {
      console.error('Failed to initialize FCM:', error);
    }
  }

  async initializeMockFCM(registration) {
    // Mock FCM token generation
    // In real implementation, this would use Firebase Cloud Messaging
    this.fcmToken = this.generateMockToken();
    
    // Store token for later use
    localStorage.setItem('fcmToken', this.fcmToken);
    
    console.log('FCM Token (mock):', this.fcmToken);
    
    // In real app, you would send this token to your server
    // await this.sendTokenToServer(this.fcmToken);
  }

  generateMockToken() {
    // Generate a mock FCM token
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let token = '';
    for (let i = 0; i < 163; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }

  setupForegroundMessageHandler() {
    // Handle foreground messages
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'notification') {
          this.handleForegroundMessage(event.data.payload);
        }
      });
    }
  }

  handleForegroundMessage(payload) {
    // Show notification when app is in foreground
    this.showLocalNotification(payload.title, payload.body, payload.data);
  }

  async showLocalNotification(title, body, data = {}) {
    if (this.permission !== 'granted') {
      console.log('Notification permission not granted');
      return;
    }

    try {
      const notification = new Notification(title, {
        body: body,
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag: data.tag || 'default',
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || [],
        data: data
      });

      // Handle notification click
      notification.onclick = () => {
        this.handleNotificationClick(notification);
      };

      // Auto-close after 5 seconds if not important
      if (!data.requireInteraction) {
        setTimeout(() => {
          notification.close();
        }, 5000);
      }

      return notification;
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  handleNotificationClick(notification) {
    // Handle notification click based on data
    const data = notification.data || {};
    
    // Close the notification
    notification.close();

    // Focus or open the app
    if (window.focus) {
      window.focus();
    }

    // Navigate based on notification type
    switch (data.type) {
      case 'leaderboard_update':
        this.navigateToLeaderboard(data.rank);
        break;
      case 'score_verified':
        this.navigateToProfile();
        break;
      case 'grading_complete':
        this.navigateToGrading();
        break;
      case 'premium_reminder':
        this.showPremiumModal();
        break;
      default:
        // Default to home
        window.location.href = '/';
    }
  }

  navigateToLeaderboard(rank) {
    window.location.href = `index.html?rank=${rank}`;
  }

  navigateToProfile() {
    window.location.href = 'profile.html';
  }

  navigateToGrading() {
    window.location.href = 'grade.html';
  }

  showPremiumModal() {
    // Trigger premium modal display
    const event = new CustomEvent('showPremiumModal');
    window.dispatchEvent(event);
  }

  // Scheduled notifications
  async scheduleDailyRankingUpdate() {
    // Schedule daily 07:01 HKT notification
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(7, 1, 0, 0);
    
    const timeUntilTomorrow = tomorrow - now;
    
    setTimeout(() => {
      this.sendDailyRankingUpdate();
      // Schedule next day
      this.scheduleDailyRankingUpdate();
    }, timeUntilTomorrow);
  }

  async sendDailyRankingUpdate() {
    try {
      // Get user's current rank (mock implementation)
      const userRank = await this.getUserRank();
      const rankChange = await this.getRankChange();
      const targetGap = await this.getTargetGap();

      const title = '🏆 今日榜單更新！';
      const body = `你排第${userRank}名 ${rankChange > 0 ? '↑' + rankChange : rankChange < 0 ? '↓' + Math.abs(rankChange) : ''}位 距離目標差${targetGap}分`;

      await this.showLocalNotification(title, body, {
        type: 'leaderboard_update',
        rank: userRank,
        tag: 'daily_ranking'
      });
    } catch (error) {
      console.error('Failed to send daily ranking update:', error);
    }
  }

  async getUserRank() {
    // Mock implementation - in real app, fetch from backend
    return Math.floor(Math.random() * 500) + 1;
  }

  async getRankChange() {
    // Mock implementation - in real app, compare with previous day
    return Math.floor(Math.random() * 21) - 10; // -10 to +10
  }

  async getTargetGap() {
    // Mock implementation - in real app, calculate based on target
    return Math.floor(Math.random() * 10) + 1;
  }

  // Achievement notifications
  async sendAchievementNotification(achievementType, achievementData) {
    const achievements = {
      'weekly_streak': {
        title: '🔥 連續7天！',
        body: '恭喜你獲得「週榜衛士」徽章！'
      },
      'monthly_streak': {
        title: '🌟 連續30天！',
        body: '恭喜你獲得「月榜傳奇」徽章！'
      },
      'perfect_score': {
        title: '⭐ 完美成績！',
        body: '恭喜你獲得全科5**成績！'
      },
      'top_10': {
        title: '🏆 排名前10！',
        body: '恭喜你進入排行榜前10名！'
      },
      'elite_board': {
        title: '👑 精英榜！',
        body: '恭喜你進入精英排行榜！'
      }
    };

    const achievement = achievements[achievementType];
    if (!achievement) return;

    await this.showLocalNotification(achievement.title, achievement.body, {
      type: 'achievement',
      achievementType,
      tag: 'achievement'
    });
  }

  // Score verification notifications
  async sendScoreVerificationNotification(subject, status) {
    const title = status === 'verified' ? '✅ 成績已驗證' : '⏳ 成績審核中';
    const body = status === 'verified' 
      ? `你的${subject}成績已通過驗證，排名已更新！`
      : `你的${subject}成績正在審核中，請耐心等待。`;

    await this.showLocalNotification(title, body, {
      type: 'score_verified',
      subject,
      status,
      tag: 'score_verification'
    });
  }

  // Grading notifications
  async sendGradingCompleteNotification(tokensEarned) {
    const title = '✅ 批改完成！';
    const body = `獲得 ${tokensEarned} 代幣，繼續努力！`;

    await this.showLocalNotification(title, body, {
      type: 'grading_complete',
      tokensEarned,
      tag: 'grading_complete'
    });
  }

  // Premium reminders
  async sendPremiumReminder() {
    const title = '⭐ 解鎖Premium功能';
    const body = '升級Premium查看完整排行榜和詳細分析！';

    await this.showLocalNotification(title, body, {
      type: 'premium_reminder',
      tag: 'premium_reminder',
      requireInteraction: true,
      actions: [
        {
          action: 'upgrade',
          title: '立即升級'
        },
        {
          action: 'dismiss',
          title: '稍後'
        }
      ]
    });
  }

  // Push notification subscription management
  async subscribeToTopic(topic) {
    if (!this.fcmToken) return false;

    try {
      // Mock topic subscription
      // In real app, this would use Firebase Admin SDK
      console.log(`Subscribed to topic: ${topic}`);
      return true;
    } catch (error) {
      console.error('Failed to subscribe to topic:', error);
      return false;
    }
  }

  async unsubscribeFromTopic(topic) {
    if (!this.fcmToken) return false;

    try {
      // Mock topic unsubscription
      console.log(`Unsubscribed from topic: ${topic}`);
      return true;
    } catch (error) {
      console.error('Failed to unsubscribe from topic:', error);
      return false;
    }
  }

  // Get notification settings
  getNotificationSettings() {
    const settings = localStorage.getItem('notificationSettings');
    return settings ? JSON.parse(settings) : {
      dailyRanking: true,
      achievements: true,
      scoreVerification: true,
      gradingComplete: true,
      premiumReminders: false
    };
  }

  // Update notification settings
  updateNotificationSettings(newSettings) {
    const currentSettings = this.getNotificationSettings();
    const updatedSettings = { ...currentSettings, ...newSettings };
    localStorage.setItem('notificationSettings', JSON.stringify(updatedSettings));
    
    // Update subscriptions based on settings
    this.updateSubscriptions(updatedSettings);
  }

  updateSubscriptions(settings) {
    if (settings.dailyRanking) {
      this.subscribeToTopic('daily_ranking');
    } else {
      this.unsubscribeFromTopic('daily_ranking');
    }

    if (settings.achievements) {
      this.subscribeToTopic('achievements');
    } else {
      this.unsubscribeFromTopic('achievements');
    }
  }

  // Test notification
  async sendTestNotification() {
    await this.showLocalNotification(
      '測試通知',
      '如果你看到這條通知，說明通知系統正常工作！',
      {
        type: 'test',
        tag: 'test'
      }
    );
  }
}

// Initialize notification system
document.addEventListener('DOMContentLoaded', () => {
  window.notificationManager = new NotificationManager();
  
  // Schedule daily notifications
  window.notificationManager.scheduleDailyRankingUpdate();
});

// Export for use in other modules
export default NotificationManager;
