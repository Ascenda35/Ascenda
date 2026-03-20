import { supabase, getCurrentUser, getUserProfile, getLeaderboard, isUploadAllowed, getTimeUntilUploadAllowed, subscribeToLeaderboard } from './supabase.js';

class LeaderboardManager {
  constructor() {
    this.currentBoard = 'general';
    this.currentUser = null;
    this.leaderboardData = [];
    this.refreshInterval = null;
    this.init();
  }

  async init() {
    try {
      await this.loadCurrentUser();
      this.setupEventListeners();
      this.setupRealtimeSubscription();
      await this.loadLeaderboard();
      this.startAutoRefresh();
      this.updateCountdowns();
    } catch (error) {
      console.error('Failed to initialize leaderboard:', error);
      this.showError('載入排行榜失敗');
    }
  }

  async loadCurrentUser() {
    try {
      this.currentUser = await getCurrentUser();
      if (this.currentUser) {
        const profile = await getUserProfile(this.currentUser.id);
        this.currentUser = { ...this.currentUser, ...profile };
        this.updateAuthButton();
        this.updateUserRank();
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
    }
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const board = e.target.dataset.board;
        if (board === 'elite' && !this.currentUser?.is_premium) {
          this.showPremiumModal();
          return;
        }
        this.switchBoard(board);
      });
    });

    // Auth button
    const authBtn = document.getElementById('authBtn');
    if (authBtn) {
      authBtn.addEventListener('click', () => this.handleAuth());
    }
  }

  setupRealtimeSubscription() {
    subscribeToLeaderboard((payload) => {
      console.log('Leaderboard update:', payload);
      this.loadLeaderboard();
    });
  }

  async switchBoard(boardType) {
    this.currentBoard = boardType;
    
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.board === boardType);
    });

    // Check upload lock
    if (!isUploadAllowed()) {
      this.showBoardLock();
    } else {
      this.hideBoardLock();
    }

    // Load new data
    await this.loadLeaderboard();
  }

  async loadLeaderboard() {
    try {
      this.showLoading();
      
      const limit = this.currentUser?.is_premium ? 100 : 10;
      this.leaderboardData = await getLeaderboard(this.currentBoard, limit);
      
      this.renderLeaderboard();
      this.updateStats();
      
      // Show premium CTA for non-premium users
      if (!this.currentUser?.is_premium && this.leaderboardData.length > 10) {
        this.showPremiumCTA();
      }
      
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      this.showError('載入排行榜失敗');
    } finally {
      this.hideLoading();
    }
  }

  renderLeaderboard() {
    const leaderboardList = document.getElementById('leaderboardList');
    if (!leaderboardList) return;

    leaderboardList.innerHTML = '';

    this.leaderboardData.forEach((user, index) => {
      const item = this.createLeaderboardItem(user, index + 1);
      leaderboardList.appendChild(item);
    });

    // Add staggered animation
    leaderboardList.classList.add('staggered-fade-in');
  }

  createLeaderboardItem(user, rank) {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    
    if (this.currentUser && user.id === this.currentUser.id) {
      item.classList.add('current-user');
    }

    const rankClass = rank <= 3 ? 'top-3' : '';
    const trend = this.calculateTrend(user);
    const trendClass = trend > 0 ? 'trend-up' : trend < 0 ? 'trend-down' : 'trend-same';
    const trendIcon = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';

    item.innerHTML = `
      <div class="rank-number ${rankClass}">${rank}</div>
      <div class="user-info">
        <div class="user-avatar">${user.display_name?.charAt(0).toUpperCase() || 'U'}</div>
        <div>
          <div class="user-name">${this.escapeHtml(user.display_name || 'Anonymous')}</div>
          ${user.school_verified ? '<span class="verification-badge">✓ 認證</span>' : ''}
        </div>
      </div>
      <div class="user-score">${user.totalScore || 0}</div>
      <div class="user-school">${this.escapeHtml(user.schools?.name_en || 'Unknown')}</div>
      <div class="user-trend ${trendClass}">
        <span>${trendIcon}</span>
        <span>${Math.abs(trend)}</span>
      </div>
    `;

    return item;
  }

  calculateTrend(user) {
    // Mock trend calculation - in real app, this would compare with previous period
    return Math.floor(Math.random() * 10) - 5;
  }

  updateStats() {
    // Update total users
    const totalUsers = document.getElementById('totalUsers');
    if (totalUsers) {
      totalUsers.textContent = this.leaderboardData.length.toLocaleString();
    }

    // Update today's uploads (mock data)
    const todayUploads = document.getElementById('todayUploads');
    if (todayUploads) {
      todayUploads.textContent = Math.floor(Math.random() * 200) + 100;
    }
  }

  updateUserRank() {
    if (!this.currentUser) return;

    const userRank = this.leaderboardData.findIndex(u => u.id === this.currentUser.id) + 1;
    const userRankSection = document.getElementById('userRankSection');
    const userRankNumber = document.getElementById('userRankNumber');
    const userTotalScore = document.getElementById('userTotalScore');
    const userTargetGap = document.getElementById('userTargetGap');
    const userStreak = document.getElementById('userStreak');

    if (userRankSection) {
      if (userRank > 0) {
        userRankSection.style.display = 'block';
        if (userRankNumber) userRankNumber.textContent = userRank;
        if (userTotalScore) userTotalScore.textContent = this.currentUser.totalScore || 0;
        if (userTargetGap) userTargetGap.textContent = this.calculateTargetGap();
        if (userStreak) userStreak.textContent = this.currentUser.streak || 0;
      } else {
        userRankSection.style.display = 'none';
      }
    }
  }

  calculateTargetGap() {
    // Mock calculation - in real app, this would calculate gap to target JUPAS score
    const targetScore = 30; // Mock target
    const currentScore = this.currentUser.totalScore || 0;
    const gap = Math.max(0, targetScore - currentScore);
    return gap > 0 ? `+${gap}` : '✓';
  }

  showBoardLock() {
    const boardLock = document.getElementById('boardLock');
    const leaderboardContent = document.getElementById('leaderboardContent');
    
    if (boardLock) boardLock.style.display = 'block';
    if (leaderboardContent) leaderboardContent.style.display = 'none';
    
    this.updateLockCountdown();
  }

  hideBoardLock() {
    const boardLock = document.getElementById('boardLock');
    const leaderboardContent = document.getElementById('leaderboardContent');
    
    if (boardLock) boardLock.style.display = 'none';
    if (leaderboardContent) leaderboardContent.style.display = 'block';
  }

  updateLockCountdown() {
    const timeUntil = getTimeUntilUploadAllowed();
    if (!timeUntil) return;

    const countdownElement = document.getElementById('lockCountdown');
    if (countdownElement) {
      countdownElement.textContent = `${timeUntil.hours}小時${timeUntil.minutes}分鐘`;
    }
  }

  updateCountdowns() {
    setInterval(() => {
      if (!isUploadAllowed()) {
        this.updateLockCountdown();
      }
      this.updateDSECountdown();
    }, 60000); // Update every minute
  }

  updateDSECountdown() {
    const dseDate = new Date('2026-04-27T09:00:00+08:00'); // Mock DSE date
    const now = new Date();
    const diff = dseDate - now;

    if (diff <= 0) return;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const countdownElement = document.getElementById('dseCountdown');
    if (countdownElement) {
      countdownElement.textContent = `${days}天 ${hours}小時`;
    }
  }

  showPremiumCTA() {
    const premiumCta = document.getElementById('premiumCta');
    if (premiumCta) {
      premiumCta.style.display = 'block';
    }
  }

  showPremiumModal() {
    // This would show a premium upgrade modal
    this.showInfo('升級Premium查看完整精英榜');
  }

  updateAuthButton() {
    const authBtn = document.getElementById('authBtn');
    if (!authBtn) return;

    if (this.currentUser) {
      authBtn.textContent = this.currentUser.display_name || 'Profile';
      authBtn.onclick = () => this.showProfile();
    } else {
      authBtn.textContent = '登入';
      authBtn.onclick = () => this.handleAuth();
    }
  }

  async handleAuth() {
    try {
      if (this.currentUser) {
        await supabase.auth.signOut();
        window.location.reload();
      } else {
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin }
        });
      }
    } catch (error) {
      console.error('Auth error:', error);
      this.showError('登入失敗');
    }
  }

  showProfile() {
    window.location.href = 'profile.html';
  }

  startAutoRefresh() {
    // Refresh leaderboard every 5 minutes
    this.refreshInterval = setInterval(() => {
      this.loadLeaderboard();
    }, 5 * 60 * 1000);
  }

  showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  showError(message) {
    const toast = document.getElementById('errorToast');
    const messageElement = document.getElementById('errorMessage');
    if (toast && messageElement) {
      messageElement.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  showSuccess(message) {
    const toast = document.getElementById('successToast');
    const messageElement = document.getElementById('successMessage');
    if (toast && messageElement) {
      messageElement.textContent = message;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  showInfo(message) {
    // For now, use success toast for info messages
    this.showSuccess(message);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }
}

// Initialize leaderboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.leaderboardManager = new LeaderboardManager();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (window.leaderboardManager) {
    window.leaderboardManager.destroy();
  }
});
