import { supabase, getCurrentUser, getUserProfile, getNextGradingItem, submitReview, addTokens, updateStreak } from './supabase.js';
import { embedWatermark } from './watermark.js';

class GradingManager {
  constructor() {
    this.currentUser = null;
    this.currentPaper = null;
    this.gradingActive = false;
    this.selectedTool = 'pen';
    this.selectedColor = '#FF453A';
    this.canvas = null;
    this.ctx = null;
    this.annotations = [];
    this.init();
  }

  async init() {
    try {
      await this.loadCurrentUser();
      this.setupCanvas();
      this.setupEventListeners();
      this.updateStats();
    } catch (error) {
      console.error('Failed to initialize grading manager:', error);
      this.showError('初始化批改系統失敗');
    }
  }

  async loadCurrentUser() {
    try {
      this.currentUser = await getCurrentUser();
      if (this.currentUser) {
        const profile = await getUserProfile(this.currentUser.id);
        this.currentUser = { ...this.currentUser, ...profile };
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
    }
  }

  setupCanvas() {
    this.canvas = document.getElementById('paperCanvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    
    // Set canvas size
    this.canvas.width = 800;
    this.canvas.height = 1000;

    // Setup drawing events
    this.setupDrawingEvents();
  }

  setupDrawingEvents() {
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      const rect = this.canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      this.drawLine(lastX, lastY, x, y);
      
      lastX = x;
      lastY = y;
    });

    this.canvas.addEventListener('mouseup', () => {
      isDrawing = false;
    });

    this.canvas.addEventListener('mouseleave', () => {
      isDrawing = false;
    });

    // Touch events for mobile
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      lastX = touch.clientX - rect.left;
      lastY = touch.clientY - rect.top;
      isDrawing = true;
    });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!isDrawing) return;
      
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      this.drawLine(lastX, lastY, x, y);
      
      lastX = x;
      lastY = y;
    });

    this.canvas.addEventListener('touchend', () => {
      isDrawing = false;
    });
  }

  setupEventListeners() {
    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectTool(e.target.dataset.tool);
      });
    });

    // Color selection
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectColor(e.target.dataset.color);
      });
    });

    // Control buttons
    document.getElementById('startGradingBtn')?.addEventListener('click', () => this.startGrading());
    document.getElementById('skipBtn')?.addEventListener('click', () => this.skipPaper());
    document.getElementById('reportBtn')?.addEventListener('click', () => this.reportPaper());
    document.getElementById('submitGradeBtn')?.addEventListener('click', () => this.submitGrade());
  }

  selectTool(tool) {
    this.selectedTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
  }

  selectColor(color) {
    this.selectedColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === color);
    });
  }

  drawLine(x1, y1, x2, y2) {
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    
    if (this.selectedTool === 'pen') {
      this.ctx.strokeStyle = this.selectedColor;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = 1;
    } else if (this.selectedTool === 'highlight') {
      this.ctx.strokeStyle = this.selectedColor;
      this.ctx.lineWidth = 8;
      this.ctx.globalAlpha = 0.3;
    } else if (this.selectedTool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.lineWidth = 20;
    }
    
    this.ctx.lineCap = 'round';
    this.ctx.stroke();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = 1;
  }

  async startGrading() {
    if (!this.currentUser) {
      this.showError('請先登入');
      return;
    }

    try {
      this.showLoading();
      
      const paper = await getNextGradingItem(this.currentUser.id);
      
      if (!paper) {
        this.showNoPapers();
        return;
      }

      this.currentPaper = paper;
      this.gradingActive = true;
      this.loadPaper();
      this.showGradingInterface();
      
    } catch (error) {
      console.error('Failed to start grading:', error);
      this.showError('開始批改失敗');
    } finally {
      this.hideLoading();
    }
  }

  loadPaper() {
    if (!this.currentPaper) return;

    // Update paper info
    document.getElementById('paperSubject').textContent = this.currentPaper.subject;
    document.getElementById('paperId').textContent = `#${this.currentPaper.id.slice(-6)}`;
    document.getElementById('questionNumber').textContent = this.currentPaper.question_num;
    document.getElementById('uploadTime').textContent = this.formatTime(this.currentPaper.created_at);
    document.getElementById('maxScore').textContent = this.currentPaper.max_score || 10;

    // Load paper image
    this.loadPaperImage(this.currentPaper.image_url);

    // Load reference answer
    this.loadReferenceAnswer(this.currentPaper.correct_answer);

    // Load marking scheme
    this.loadMarkingScheme(this.currentPaper.marking_scheme);
  }

  async loadPaperImage(imageUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw image to fit canvas
        const scale = Math.min(
          this.canvas.width / img.width,
          this.canvas.height / img.height
        );
        
        const width = img.width * scale;
        const height = img.height * scale;
        const x = (this.canvas.width - width) / 2;
        const y = (this.canvas.height - height) / 2;
        
        this.ctx.drawImage(img, x, y, width, height);
        
        // Embed invisible watermark
        embedWatermark(this.canvas, this.currentUser.id);
      };
      
      img.onerror = () => {
        // Load placeholder if image fails
        this.loadPlaceholderImage();
      };
      
      img.src = imageUrl;
    } catch (error) {
      console.error('Failed to load paper image:', error);
      this.loadPlaceholderImage();
    }
  }

  loadPlaceholderImage() {
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.fillStyle = '#666';
    this.ctx.font = '24px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('試卷載入中...', this.canvas.width / 2, this.canvas.height / 2);
  }

  loadReferenceAnswer(answer) {
    const element = document.getElementById('correctAnswer');
    if (element) {
      element.innerHTML = `<pre>${this.escapeHtml(answer || '參考答案載入中...')}</pre>`;
    }
  }

  loadMarkingScheme(scheme) {
    const element = document.getElementById('markingScheme');
    if (element) {
      element.innerHTML = `<pre>${this.escapeHtml(scheme || '評分標準載入中...')}</pre>`;
    }
  }

  showGradingInterface() {
    document.getElementById('startGrading').style.display = 'none';
    document.getElementById('gradingInterface').style.display = 'block';
  }

  showNoPapers() {
    document.getElementById('startGrading').style.display = 'none';
    document.getElementById('noPapers').style.display = 'block';
    
    // Schedule next check
    setTimeout(() => {
      document.getElementById('noPapers').style.display = 'none';
      document.getElementById('startGrading').style.display = 'block';
    }, 30000); // 30 seconds
  }

  async submitGrade() {
    if (!this.currentPaper || !this.gradingActive) return;

    const scoreInput = document.getElementById('questionScore');
    const feedbackInput = document.getElementById('scoreFeedback');
    
    const score = parseFloat(scoreInput?.value);
    const feedback = feedbackInput?.value || '';

    if (isNaN(score) || score < 0) {
      this.showError('請輸入有效分數');
      return;
    }

    try {
      this.showLoading();
      
      await submitReview(this.currentUser.id, this.currentPaper.id, score);
      
      // Award tokens and points
      await addTokens(this.currentUser.id, 1);
      await updateStreak(this.currentUser.id);
      
      this.showSuccess('批改完成！獲得 1 代幣 + 1 積分');
      
      // Reset for next paper
      this.resetGrading();
      await this.startGrading();
      
    } catch (error) {
      console.error('Failed to submit grade:', error);
      this.showError('提交評分失敗');
    } finally {
      this.hideLoading();
    }
  }

  skipPaper() {
    this.resetGrading();
    this.startGrading();
  }

  reportPaper() {
    const modal = document.getElementById('reportModal');
    if (modal) {
      modal.style.display = 'flex';
    }
  }

  resetGrading() {
    this.currentPaper = null;
    this.gradingActive = false;
    this.annotations = [];
    
    // Clear canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Reset form
    const scoreInput = document.getElementById('questionScore');
    const feedbackInput = document.getElementById('scoreFeedback');
    if (scoreInput) scoreInput.value = '';
    if (feedbackInput) feedbackInput.value = '';
    
    // Hide interface
    document.getElementById('gradingInterface').style.display = 'none';
  }

  updateStats() {
    if (!this.currentUser) return;

    // Update token count
    const tokenElement = document.getElementById('userTokens');
    if (tokenElement) {
      tokenElement.textContent = this.currentUser.tokens || 0;
    }

    // Update monthly points
    const pointsElement = document.getElementById('monthlyPoints');
    if (pointsElement) {
      pointsElement.textContent = this.currentUser.monthly_points || 0;
    }

    // Update queue length (mock data)
    const queueElement = document.getElementById('queueLength');
    if (queueElement) {
      queueElement.textContent = Math.floor(Math.random() * 20) + 5;
    }

    // Update today graded (mock data)
    const todayElement = document.getElementById('todayGraded');
    if (todayElement) {
      todayElement.textContent = Math.floor(Math.random() * 300) + 200;
    }

    // Update accuracy rate (mock data)
    const accuracyElement = document.getElementById('accuracyRate');
    if (accuracyElement) {
      accuracyElement.textContent = `${Math.floor(Math.random() * 10) + 85}%`;
    }
  }

  formatTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now - time;
    
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小時前`;
    if (minutes > 0) return `${minutes}分鐘前`;
    return '剛剛';
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Control functions
function zoomIn() {
  const canvas = document.getElementById('paperCanvas');
  if (canvas) {
    canvas.style.transform = `scale(${(parseFloat(canvas.style.transform?.replace('scale(', '')?.replace(')', '') || 1) + 0.1)})`;
  }
}

function zoomOut() {
  const canvas = document.getElementById('paperCanvas');
  if (canvas) {
    const currentScale = parseFloat(canvas.style.transform?.replace('scale(', '')?.replace(')', '') || 1);
    canvas.style.transform = `scale(${Math.max(0.5, currentScale - 0.1)})`;
  }
}

function resetZoom() {
  const canvas = document.getElementById('paperCanvas');
  if (canvas) {
    canvas.style.transform = 'scale(1)';
  }
}

function toggleFullscreen() {
  const canvas = document.getElementById('paperCanvas');
  if (canvas) {
    if (!document.fullscreenElement) {
      canvas.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
}

// Modal functions
function closeReportModal() {
  const modal = document.getElementById('reportModal');
  if (modal) modal.style.display = 'none';
}

function submitReport() {
  const reason = document.getElementById('reportReason')?.value;
  const details = document.getElementById('reportDetails')?.value;
  
  if (!reason) {
    alert('請選擇檢舉原因');
    return;
  }
  
  // Submit report logic here
  console.log('Report submitted:', { reason, details });
  
  closeReportModal();
  window.gradingManager?.showSuccess('檢舉已提交');
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.gradingManager = new GradingManager();
});

// Make functions globally available
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.resetZoom = resetZoom;
window.toggleFullscreen = toggleFullscreen;
window.closeReportModal = closeReportModal;
window.submitReport = submitReport;
