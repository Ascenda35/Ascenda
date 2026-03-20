class PaymentManager {
  constructor() {
    this.stripe = null;
    this.isInitialized = false;
    this.init();
  }

  async init() {
    try {
      await this.initializeStripe();
      this.setupEventListeners();
      console.log('Payment system initialized');
    } catch (error) {
      console.error('Failed to initialize payment system:', error);
    }
  }

  async initializeStripe() {
    try {
      // Initialize Stripe with publishable key
      this.stripe = Stripe('pk_live_51TD38rEblHU4SzhgsCEZOCUY3byRfzBRjMCNhjUecQeNtcLTdVe8tRkLhXyxid409DvnT0DabdkhOsk9kWLym2LP00Qd1hHJOY');
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Stripe:', error);
      // Use mock Stripe for development
      this.stripe = this.createMockStripe();
    }
  }

  createMockStripe() {
    return {
      redirectToCheckout: async ({ sessionId }) => {
        console.log('Mock Stripe checkout with session:', sessionId);
        
        // Simulate successful payment after 2 seconds
        setTimeout(() => {
          window.location.href = `${window.location.pathname}?payment=success&plan=${new URLSearchParams(window.location.search).get('plan') || 'monthly'}`;
        }, 2000);
        
        return { error: null };
      }
    };
  }

  setupEventListeners() {
    // Listen for payment success in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
      this.handlePaymentSuccess(urlParams.get('plan'));
    }

    // Listen for premium modal events
    window.addEventListener('showPremiumModal', () => {
      this.showPremiumModal();
    });
  }

  async startCheckout(plan) {
    if (!this.isInitialized) {
      console.error('Payment system not initialized');
      this.showError('支付系統未初始化');
      return;
    }

    try {
      this.showLoading();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('用戶未登入');
      }

      // Create checkout session
      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        { 
          body: { 
            userId: user.id, 
            plan: plan,
            successUrl: `${window.location.origin}${window.location.pathname}?payment=success&plan=${plan}`,
            cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancelled`
          } 
        }
      );

      if (error) {
        throw new Error('創建支付會話失敗');
      }

      // Redirect to Stripe Checkout
      const { error: stripeError } = await this.stripe.redirectToCheckout({ 
        sessionId: data.sessionId 
      });

      if (stripeError) {
        throw stripeError.message;
      }

    } catch (error) {
      console.error('Checkout error:', error);
      this.showError(error.message || '支付失敗');
    } finally {
      this.hideLoading();
    }
  }

  async handlePaymentSuccess(plan) {
    try {
      this.showLoading();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('用戶未登入');
      }

      // Update user premium status
      const updates = {
        is_premium: true,
        premium_type: plan === 'rescue' ? 'free' : 'paid'
      };

      if (plan === 'rescue') {
        // Add 30 tokens for rescue pack
        updates.tokens = supabase.raw('tokens + 30');
      } else if (plan === 'monthly') {
        updates.premium_expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (plan === 'yearly') {
        updates.premium_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      const { error: updateError } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user.id);

      if (updateError) {
        throw new Error('更新用戶狀態失敗');
      }

      // Show success message
      this.showPaymentSuccess(plan);

      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (error) {
      console.error('Payment success handling error:', error);
      this.showError('處理支付成功時出錯');
    } finally {
      this.hideLoading();
    }
  }

  showPaymentSuccess(plan) {
    const messages = {
      monthly: '🎉 月費Premium升級成功！',
      yearly: '🎉 年費Premium升級成功！',
      rescue: '✅ 補分包購買成功！'
    };

    const message = messages[plan] || '🎉 升級成功！';
    
    // Show success toast
    this.showSuccess(message);

    // Show confetti animation
    this.showConfetti();

    // Update UI
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }

  showConfetti() {
    // Create confetti elements
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
    const confettiCount = 50;

    for (let i = 0; i < confettiCount; i++) {
      setTimeout(() => {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
        document.body.appendChild(confetti);

        // Remove confetti after animation
        setTimeout(() => {
          confetti.remove();
        }, 4000);
      }, i * 30);
    }
  }

  showPremiumModal() {
    const modal = document.getElementById('premiumModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  closePremiumModal() {
    const modal = document.getElementById('premiumModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Payment method management
  async getPaymentMethods() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('用戶未登入');

      // In real implementation, this would call Stripe API
      // For now, return mock data
      return [
        {
          id: 'pm_mock_visa',
          type: 'card',
          brand: 'visa',
          last4: '4242',
          expiry_month: 12,
          expiry_year: 2025
        }
      ];
    } catch (error) {
      console.error('Error getting payment methods:', error);
      return [];
    }
  }

  async getSubscriptionStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('用戶未登入');

      const { data: profile } = await supabase
        .from('users')
        .select('is_premium, premium_type, premium_expires_at')
        .eq('id', user.id)
        .single();

      return {
        isActive: profile.is_premium,
        plan: profile.premium_type,
        expiresAt: profile.premium_expires_at,
        willRenew: profile.premium_type === 'paid'
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return {
        isActive: false,
        plan: 'free',
        expiresAt: null,
        willRenew: false
      };
    }
  }

  async cancelSubscription() {
    try {
      this.showLoading();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('用戶未登入');

      // In real implementation, this would call Stripe API to cancel subscription
      // For now, just update user record
      const { error } = await supabase
        .from('users')
        .update({ 
          is_premium: false,
          premium_type: 'free',
          premium_expires_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      this.showSuccess('訂閱已取消');
      setTimeout(() => window.location.reload(), 2000);

    } catch (error) {
      console.error('Error cancelling subscription:', error);
      this.showError('取消訂閱失敗');
    } finally {
      this.hideLoading();
    }
  }

  // Pricing and plans
  getPricingPlans() {
    return {
      monthly: {
        id: 'monthly',
        name: '月費計劃',
        price: 28,
        currency: 'HKD',
        interval: 'month',
        features: [
          '完整前100名排行榜',
          '學校級別匿名排名',
          '成績歷史趨勢圖表',
          '完整 JUPAS 預測引擎',
          '認證榜 + 精英榜存取',
          '無廣告干擾體驗'
        ]
      },
      yearly: {
        id: 'yearly',
        name: '年費計劃',
        price: 198,
        currency: 'HKD',
        interval: 'year',
        savings: 33,
        features: [
          '月費計劃所有功能',
          '節省33%費用',
          '優先客戶支援',
          '專屬徽章',
          'Beta功能優先體驗'
        ]
      },
      rescue: {
        id: 'rescue',
        name: '補分包',
        price: 5,
        currency: 'HKD',
        interval: 'one_time',
        features: [
          '+30 批改代幣',
          '立即生效',
          '無需訂閱'
        ]
      }
    };
  }

  // UI helpers
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

  // Format currency
  formatCurrency(amount, currency = 'HKD') {
    return new Intl.NumberFormat('zh-HK', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  // Calculate savings
  calculateSavings(monthlyPrice, yearlyPrice) {
    const yearlyMonthly = yearlyPrice / 12;
    const savings = ((monthlyPrice - yearlyMonthly) / monthlyPrice) * 100;
    return Math.round(savings);
  }
}

// Initialize payment system
document.addEventListener('DOMContentLoaded', () => {
  window.paymentManager = new PaymentManager();
});

// Global functions for button clicks
window.startCheckout = (plan) => {
  if (window.paymentManager) {
    window.paymentManager.startCheckout(plan);
  }
};

window.showPremium = () => {
  if (window.paymentManager) {
    window.paymentManager.showPremiumModal();
  }
};

window.closePremium = () => {
  if (window.paymentManager) {
    window.paymentManager.closePremiumModal();
  }
};

export default PaymentManager;
