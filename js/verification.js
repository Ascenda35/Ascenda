import { supabase, getCurrentUser, getSchools, createOTPVerification, verifyOTP } from './supabase.js';

class VerificationManager {
  constructor() {
    this.schools = [];
    this.selectedSchool = null;
    this.currentStep = 1;
    this.otpResendTimer = null;
    this.init();
  }

  async init() {
    try {
      await this.loadSchools();
      this.setupEventListeners();
      this.initializeStepIndicators();
      console.log('Verification system initialized');
    } catch (error) {
      console.error('Failed to initialize verification:', error);
    }
  }

  async loadSchools() {
    try {
      this.schools = await getSchools();
      this.renderSchoolList();
    } catch (error) {
      console.error('Failed to load schools:', error);
      // Load mock data if API fails
      this.schools = this.getMockSchools();
      this.renderSchoolList();
    }
  }

  getMockSchools() {
    return [
      {
        id: 'spcc',
        name_tc: '聖保羅男女中學',
        name_en: "St. Paul's Co-educational College",
        district: '中西區',
        allowed_domains: ['spcc.edu.hk']
      },
      {
        id: 'dbs',
        name_tc: '拔萃男書院',
        name_en: 'Diocesan Boys School',
        district: '九龍城',
        allowed_domains: ['dbs.edu.hk']
      },
      {
        id: 'dgs',
        name_tc: '拔萃女書院',
        name_en: 'Diocesan Girls School',
        district: '九龍城',
        allowed_domains: ['dgs.edu.hk']
      },
      {
        id: 'kcc',
        name_tc: '皇仁書院',
        name_en: 'Queen\'s College',
        district: '灣仔',
        allowed_domains: ['qc.edu.hk']
      },
      {
        id: 'wyc',
        name_tc: '華仁書院',
        name_en: 'Wah Yan College',
        district: '灣仔',
        allowed_domains: ['wahyan.edu.hk']
      }
    ];
  }

  setupEventListeners() {
    // School search
    const searchInput = document.getElementById('schoolSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filterSchools(e.target.value);
      });
    }

    // Email validation
    const emailInput = document.getElementById('schoolEmail');
    if (emailInput) {
      emailInput.addEventListener('input', (e) => {
        this.validateEmail(e.target.value);
      });
    }

    // OTP inputs
    this.setupOTPInputs();

    // Form submissions
    const sendOTPBtn = document.getElementById('sendOTPBtn');
    if (sendOTPBtn) {
      sendOTPBtn.addEventListener('click', () => this.sendOTP());
    }

    const verifyOTPBtn = document.getElementById('verifyOTPBtn');
    if (verifyOTPBtn) {
      verifyOTPBtn.addEventListener('click', () => this.verifyOTPCode());
    }

    const resendOTPBtn = document.getElementById('resendOTPBtn');
    if (resendOTPBtn) {
      resendOTPBtn.addEventListener('click', () => this.resendOTP());
    }
  }

  setupOTPInputs() {
    const otpInputs = document.querySelectorAll('.otp-input');
    
    otpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;
        
        // Only allow numbers
        if (!/^\d*$/.test(value)) {
          e.target.value = '';
          return;
        }

        // Move to next input
        if (value.length === 1 && index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        }

        // Check if all inputs are filled
        const allFilled = Array.from(otpInputs).every(input => input.value.length === 1);
        if (allFilled) {
          this.verifyOTPCode();
        }
      });

      input.addEventListener('keydown', (e) => {
        // Move to previous input on backspace
        if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
          otpInputs[index - 1].focus();
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text');
        const digits = pastedData.replace(/\D/g, '').slice(0, 6);
        
        digits.split('').forEach((digit, i) => {
          if (otpInputs[i]) {
            otpInputs[i].value = digit;
          }
        });

        // Focus on next empty input or verify if all filled
        const nextEmpty = Array.from(otpInputs).findIndex(input => !input.value);
        if (nextEmpty !== -1) {
          otpInputs[nextEmpty].focus();
        } else {
          this.verifyOTPCode();
        }
      });
    });
  }

  renderSchoolList() {
    const schoolList = document.getElementById('schoolList');
    if (!schoolList) return;

    schoolList.innerHTML = '';

    this.schools.forEach(school => {
      const schoolCard = this.createSchoolCard(school);
      schoolList.appendChild(schoolCard);
    });
  }

  createSchoolCard(school) {
    const card = document.createElement('div');
    card.className = 'school-card';
    card.onclick = () => this.selectSchool(school);

    const currentLang = document.documentElement.lang || 'zh-HK';
    const schoolName = currentLang === 'zh-CN' ? school.name_tc || school.name_en :
                       currentLang === 'en' ? school.name_en : 
                       school.name_tc || school.name_en;

    card.innerHTML = `
      <div class="school-info">
        <h3>${this.escapeHtml(schoolName)}</h3>
        <p class="school-district">${this.escapeHtml(school.district)}</p>
      </div>
      <div class="school-domains">
        <small>支援域名: ${school.allowed_domains.join(', ')}</small>
      </div>
    `;

    return card;
  }

  filterSchools(searchTerm) {
    const schoolCards = document.querySelectorAll('.school-card');
    const lowerSearch = searchTerm.toLowerCase();

    schoolCards.forEach(card => {
      const schoolName = card.querySelector('h3').textContent.toLowerCase();
      const district = card.querySelector('.school-district').textContent.toLowerCase();
      const domains = card.querySelector('.school-domains').textContent.toLowerCase();

      const matches = schoolName.includes(lowerSearch) || 
                     district.includes(lowerSearch) || 
                     domains.includes(lowerSearch);

      card.style.display = matches ? 'block' : 'none';
    });

    // Show "not found" message if no results
    const visibleCards = Array.from(schoolCards).filter(card => card.style.display !== 'none');
    const notFoundElement = document.getElementById('schoolNotFound');
    
    if (notFoundElement) {
      notFoundElement.style.display = visibleCards.length === 0 ? 'block' : 'none';
    }
  }

  selectSchool(school) {
    this.selectedSchool = school;
    this.goToStep(2);
    this.displaySelectedSchool();
  }

  displaySelectedSchool() {
    const selectedSchoolElement = document.getElementById('selectedSchool');
    if (!selectedSchoolElement || !this.selectedSchool) return;

    const currentLang = document.documentElement.lang || 'zh-HK';
    const schoolName = currentLang === 'zh-CN' ? this.selectedSchool.name_tc || this.selectedSchool.name_en :
                       currentLang === 'en' ? this.selectedSchool.name_en : 
                       this.selectedSchool.name_tc || this.selectedSchool.name_en;

    selectedSchoolElement.innerHTML = `
      <div class="selected-school-info">
        <strong>已選擇學校:</strong> ${this.escapeHtml(schoolName)}
        <button type="button" class="change-school-btn" onclick="verificationManager.goToStep(1)">更改</button>
      </div>
    `;
  }

  validateEmail(email) {
    if (!email) return;

    const validationElement = document.getElementById('emailValidation');
    if (!validationElement) return;

    const domain = this.extractDomain(email);
    const isValidFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isAllowedDomain = this.selectedSchool && 
                           this.selectedSchool.allowed_domains.includes(domain);

    let message = '';
    let isValid = true;

    if (!isValidFormat) {
      message = '電郵格式不正確';
      isValid = false;
    } else if (!isAllowedDomain) {
      message = '此電郵域名不在支援列表中';
      isValid = false;
    }

    validationElement.innerHTML = message ? `<span class="validation-error">${message}</span>` : '';
    validationElement.className = isValid ? 'email-validation valid' : 'email-validation invalid';

    return isValid;
  }

  extractDomain(email) {
    return email.toLowerCase().split('@')[1]?.trim();
  }

  async sendOTP() {
    try {
      const emailInput = document.getElementById('schoolEmail');
      const email = emailInput?.value?.trim();

      if (!email) {
        this.showError('請輸入學校電郵');
        return;
      }

      if (!this.validateEmail(email)) {
        this.showError('請輸入有效的學校電郵');
        return;
      }

      this.showLoading();

      // Get current user
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('用戶未登入');
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Create OTP verification record
      await createOTPVerification(user.id, email, otpCode);

      // In real implementation, send email via Supabase Auth or email service
      console.log(`OTP sent to ${email}: ${otpCode}`);

      // For development, show OTP in console
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        alert(`開發模式 OTP: ${otpCode}`);
      }

      this.goToStep(3);
      this.displayOTPInfo(email);
      this.startOTPCountdown();

      this.showSuccess('驗證碼已發送至你的學校電郵');

    } catch (error) {
      console.error('Failed to send OTP:', error);
      this.showError('發送驗證碼失敗');
    } finally {
      this.hideLoading();
    }
  }

  displayOTPInfo(email) {
    const otpEmailElement = document.getElementById('otpEmail');
    if (otpEmailElement) {
      otpEmailElement.textContent = email;
    }
  }

  startOTPCountdown() {
    let countdown = 60;
    const countdownElement = document.getElementById('countdownTime');
    const resendBtn = document.getElementById('resendOTPBtn');
    const countdownDiv = document.getElementById('otpCountdown');

    if (resendBtn) resendBtn.disabled = true;
    if (countdownDiv) countdownDiv.style.display = 'block';

    this.otpResendTimer = setInterval(() => {
      countdown--;
      
      if (countdownElement) {
        countdownElement.textContent = countdown;
      }

      if (countdown <= 0) {
        clearInterval(this.otpResendTimer);
        if (resendBtn) resendBtn.disabled = false;
        if (countdownDiv) countdownDiv.style.display = 'none';
      }
    }, 1000);
  }

  async verifyOTPCode() {
    try {
      const otpInputs = document.querySelectorAll('.otp-input');
      const otpCode = Array.from(otpInputs).map(input => input.value).join('');

      if (otpCode.length !== 6) {
        this.showError('請輸入完整的6位驗證碼');
        return;
      }

      this.showLoading();

      // Get current user
      const user = await getCurrentUser();
      if (!user) {
        throw new Error('用戶未登入');
      }

      // Verify OTP
      const verification = await verifyOTP(user.id, otpCode);

      if (!verification) {
        this.showError('驗證碼不正確或已過期');
        return;
      }

      // Update user profile
      const { error: updateError } = await supabase
        .from('users')
        .update({
          school_email: verification.school_email,
          school_verified: true
        })
        .eq('id', user.id);

      if (updateError) {
        throw new Error('更新用戶資料失敗');
      }

      this.showSuccess('學校驗證成功！');
      this.showSuccessContainer();

    } catch (error) {
      console.error('Failed to verify OTP:', error);
      this.showError('驗證失敗');
    } finally {
      this.hideLoading();
    }
  }

  async resendOTP() {
    try {
      const emailInput = document.getElementById('schoolEmail');
      const email = emailInput?.value?.trim();

      if (!email) {
        this.showError('找不到電郵地址');
        return;
      }

      await this.sendOTP();
      this.showSuccess('驗證碼已重新發送');

    } catch (error) {
      console.error('Failed to resend OTP:', error);
      this.showError('重新發送失敗');
    }
  }

  goToStep(step) {
    // Hide all steps
    for (let i = 1; i <= 3; i++) {
      const stepElement = document.getElementById(`step${i}`);
      if (stepElement) {
        stepElement.style.display = i === step ? 'block' : 'none';
      }
    }

    this.currentStep = step;
    this.updateStepIndicators();
  }

  initializeStepIndicators() {
    this.updateStepIndicators();
  }

  updateStepIndicators() {
    for (let i = 1; i <= 3; i++) {
      const indicators = document.querySelectorAll(`.step-indicator .step:nth-child(${i * 2 - 1})`);
      indicators.forEach(indicator => {
        indicator.className = 'step';
        if (i < this.currentStep) {
          indicator.classList.add('completed');
        } else if (i === this.currentStep) {
          indicator.classList.add('active');
        }
      });

      // Update step lines
      const lines = document.querySelectorAll(`.step-indicator .step:nth-child(${i * 2})`);
      lines.forEach(line => {
        line.className = 'step-line';
        if (i < this.currentStep) {
          line.classList.add('active');
        }
      });
    }
  }

  showSuccessContainer() {
    const successContainer = document.getElementById('successContainer');
    if (successContainer) {
      successContainer.style.display = 'block';
    }

    // Hide all steps
    for (let i = 1; i <= 3; i++) {
      const stepElement = document.getElementById(`step${i}`);
      if (stepElement) {
        stepElement.style.display = 'none';
      }
    }
  }

  submitSchoolRequest() {
    const modal = document.getElementById('schoolRequestModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  closeSchoolRequest() {
    const modal = document.getElementById('schoolRequestModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  async submitSchoolRequestForm() {
    try {
      const schoolName = document.getElementById('requestSchoolName')?.value?.trim();
      const schoolDomain = document.getElementById('requestSchoolDomain')?.value?.trim();
      const district = document.getElementById('requestSchoolDistrict')?.value;
      const contactEmail = document.getElementById('requestContactEmail')?.value?.trim();

      if (!schoolName || !schoolDomain || !contactEmail) {
        this.showError('請填寫所有必需欄位');
        return;
      }

      this.showLoading();

      // In real implementation, submit to backend
      console.log('School request submitted:', {
        schoolName,
        schoolDomain,
        district,
        contactEmail
      });

      this.showSuccess('學校資料已提交，我們會盡快處理');
      this.closeSchoolRequest();

    } catch (error) {
      console.error('Failed to submit school request:', error);
      this.showError('提交失敗');
    } finally {
      this.hideLoading();
    }
  }

  goToProfile() {
    window.location.href = 'profile.html';
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize verification system
document.addEventListener('DOMContentLoaded', () => {
  window.verificationManager = new VerificationManager();
});

// Global functions
window.submitSchoolRequest = () => {
  if (window.verificationManager) {
    window.verificationManager.submitSchoolRequest();
  }
};

window.closeSchoolRequest = () => {
  if (window.verificationManager) {
    window.verificationManager.closeSchoolRequest();
  }
};

window.submitSchoolRequestForm = () => {
  if (window.verificationManager) {
    window.verificationManager.submitSchoolRequestForm();
  }
};

window.goToProfile = () => {
  if (window.verificationManager) {
    window.verificationManager.goToProfile();
  }
};

export default VerificationManager;
