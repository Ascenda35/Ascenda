import { supabase, getCurrentUser, getUserProfile, calculateJUPASScore, getGradeFromScore } from './supabase.js';

class JUPASManager {
  constructor() {
    this.currentUser = null;
    this.jupasData = [];
    this.userScores = {};
    this.selectedUniversity = 'all';
    this.init();
  }

  async init() {
    try {
      await this.loadCurrentUser();
      await this.loadJUPASData();
      await this.loadUserScores();
      this.setupEventListeners();
      this.renderDreamMap();
      this.updateCountdown();
    } catch (error) {
      console.error('Failed to initialize JUPAS manager:', error);
      this.showError('載入夢想版圖失敗');
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

  async loadJUPASData() {
    try {
      const response = await fetch('../jupas-data.json');
      this.jupasData = await response.json();
    } catch (error) {
      console.error('Failed to load JUPAS data:', error);
      // Use mock data if file not available
      this.jupasData = this.getMockJUPASData();
    }
  }

  async loadUserScores() {
    if (!this.currentUser) return;

    try {
      const { data, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', this.currentUser.id)
        .eq('verification_status', 'verified');

      if (error) throw error;

      // Group scores by subject
      this.userScores = {};
      data.forEach(score => {
        if (!this.userScores[score.subject] || score.score > this.userScores[score.subject]) {
          this.userScores[score.subject] = score.score;
        }
      });

      this.updateScoreDisplay();
    } catch (error) {
      console.error('Failed to load user scores:', error);
    }
  }

  setupEventListeners() {
    // University filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.selectedUniversity = e.target.dataset.university;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.renderDreamMap();
      });
    });

    // Search
    const searchInput = document.getElementById('programSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchPrograms(e.target.value);
      });
    }
  }

  updateScoreDisplay() {
    const totalScoreElement = document.getElementById('userTotalScore');
    const scoreBreakdown = {
      chinese: this.userScores.chinese || 0,
      english: this.userScores.english || 0,
      math: this.userScores.math || 0,
      bestElective: 0,
      secondElective: 0
    };

    // Calculate best electives
    const electives = ['physics', 'chemistry', 'biology', 'econ', 'history', 'geography', 'bafs', 'cs', 'm1', 'm2']
      .filter(subject => this.userScores[subject])
      .map(subject => ({ subject, score: this.userScores[subject] }))
      .sort((a, b) => b.score - a.score);

    if (electives.length >= 1) {
      scoreBreakdown.bestElective = electives[0].score;
    }
    if (electives.length >= 2) {
      scoreBreakdown.secondElective = electives[1].score;
    }

    // Update total score
    const totalScore = Object.values(scoreBreakdown).reduce((sum, score) => sum + score, 0);
    if (totalScoreElement) {
      totalScoreElement.textContent = totalScore.toFixed(1);
    }

    // Update breakdown
    const elements = {
      chineseGrade: getGradeFromScore(scoreBreakdown.chinese),
      englishGrade: getGradeFromScore(scoreBreakdown.english),
      mathGrade: getGradeFromScore(scoreBreakdown.math),
      bestElectiveGrade: getGradeFromScore(scoreBreakdown.bestElective),
      secondElectiveGrade: getGradeFromScore(scoreBreakdown.secondElective)
    };

    Object.entries(elements).forEach(([id, grade]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = grade || '--';
    });

    // Update predictions
    this.updatePredictions(totalScore);
  }

  updatePredictions(currentScore) {
    const improvementRate = this.calculateImprovementRate();
    const targetTime = this.predictTargetTime(currentScore, improvementRate);

    const rateElement = document.getElementById('improvementRate');
    const timeElement = document.getElementById('targetTime');

    if (rateElement) {
      rateElement.textContent = improvementRate > 0 ? `+${improvementRate.toFixed(1)}/週` : '穩定';
    }

    if (timeElement) {
      if (targetTime > 0) {
        timeElement.textContent = `${targetTime}週後`;
      } else {
        timeElement.textContent = '已達標';
      }
    }
  }

  calculateImprovementRate() {
    // Mock calculation - in real app, this would analyze historical data
    return Math.random() * 2 + 0.5; // 0.5-2.5 points per week
  }

  predictTargetTime(currentScore, improvementRate) {
    const targetScore = 30; // Mock target score
    if (currentScore >= targetScore) return 0;
    
    const gap = targetScore - currentScore;
    return Math.ceil(gap / improvementRate);
  }

  renderDreamMap() {
    const grid = document.getElementById('dreamMapGrid');
    if (!grid) return;

    grid.innerHTML = '';

    let filteredData = this.jupasData;
    if (this.selectedUniversity !== 'all') {
      filteredData = this.jupasData.filter(program => 
        program.university.toLowerCase() === this.selectedUniversity
      );
    }

    filteredData.forEach(program => {
      const card = this.createProgramCard(program);
      grid.appendChild(card);
    });

    // Add animation
    grid.classList.add('staggered-fade-in');
  }

  createProgramCard(program) {
    const card = document.createElement('div');
    card.className = 'program-card';
    
    const status = this.getProgramStatus(program);
    const statusClass = status.zone.toLowerCase();
    
    card.innerHTML = `
      <div class="program-header">
        <div class="program-code">${program.code}</div>
        <div class="program-status ${statusClass}">${status.text}</div>
      </div>
      <div class="program-title">${this.escapeHtml(program.name)}</div>
      <div class="program-university">${this.escapeHtml(program.university)}</div>
      <div class="program-score">
        <span class="score-label">入學分數</span>
        <span class="score-value">${program.lq}</span>
      </div>
      <div class="program-gap">
        <span class="gap-label">相差</span>
        <span class="gap-value ${status.gapClass}">${status.gap}</span>
      </div>
    `;

    card.addEventListener('click', () => this.showProgramDetails(program));
    return card;
  }

  getProgramStatus(program) {
    const currentScore = this.getCurrentTotalScore();
    const lq = program.lq;
    const gap = currentScore - lq;

    if (gap >= 0) {
      return {
        zone: 'GREEN',
        text: '已踩線 ✅',
        gap: '+0',
        gapClass: 'positive'
      };
    } else if (gap >= -2) {
      return {
        zone: 'YELLOW',
        text: '接近 🟡',
        gap: `${gap}`,
        gapClass: 'warning'
      };
    } else {
      return {
        zone: 'RED',
        text: '目標 🎯',
        gap: `${gap}`,
        gapClass: 'negative'
      };
    }
  }

  getCurrentTotalScore() {
    const elements = ['chinese', 'english', 'math', 'physics', 'chemistry', 'biology', 'econ', 'history', 'geography', 'bafs', 'cs', 'm1', 'm2'];
    const scores = elements.map(subject => this.userScores[subject] || 0);
    return calculateJUPASScore(scores);
  }

  searchPrograms(query) {
    const cards = document.querySelectorAll('.program-card');
    const lowerQuery = query.toLowerCase();

    cards.forEach(card => {
      const title = card.querySelector('.program-title').textContent.toLowerCase();
      const code = card.querySelector('.program-code').textContent.toLowerCase();
      const university = card.querySelector('.program-university').textContent.toLowerCase();

      const matches = title.includes(lowerQuery) || 
                     code.includes(lowerQuery) || 
                     university.includes(lowerQuery);

      card.style.display = matches ? 'block' : 'none';
    });
  }

  showProgramDetails(program) {
    const modal = document.getElementById('programmeModal');
    if (!modal) return;

    const currentScore = this.getCurrentTotalScore();
    const gap = currentScore - program.lq;
    const chance = this.calculateAdmissionChance(gap);

    // Update modal content
    document.getElementById('programmeCode').textContent = program.code;
    document.getElementById('programmeUniversity').textContent = program.university;
    document.getElementById('programmeFaculty').textContent = program.faculty;
    document.getElementById('programmeLq').textContent = program.lq;
    document.getElementById('programmeUserScore').textContent = currentScore.toFixed(1);
    document.getElementById('programmeGap').textContent = gap >= 0 ? '+0' : gap.toString();
    document.getElementById('programmeChance').textContent = chance;

    // Add analysis
    this.updateProgramAnalysis(program, gap);
    this.updateRecommendations(program, gap);

    modal.style.display = 'flex';
  }

  calculateAdmissionChance(gap) {
    if (gap >= 0) return '95%+';
    if (gap >= -1) return '70-80%';
    if (gap >= -2) return '40-60%';
    if (gap >= -3) return '20-30%';
    return '<10%';
  }

  updateProgramAnalysis(program, gap) {
    const analysisElement = document.getElementById('programmeAnalysis');
    if (!analysisElement) return;

    let analysis = `<p><strong>入學分析：</strong></p>`;
    
    if (gap >= 0) {
      analysis += `<p>✅ 你的分數已達到此課程的最低入學要求。根據過往數據，你的入學機會很高。</p>`;
    } else if (gap >= -2) {
      analysis += `<p>🟡 你的分數接近入學要求。建議專注提升核心科目，機會仍然存在。</p>`;
    } else {
      analysis += `<p>🎯 需要提升分數才能達到入學要求。建議制定詳細學習計劃。</p>`;
    }

    analysis += `<p><strong>競爭情況：</strong>${program.competition || '中等競爭'}</p>`;
    analysis += `<p><strong>趨勢：</strong>${program.trend || '分數穩定'}</p>`;

    analysisElement.innerHTML = analysis;
  }

  updateRecommendations(program, gap) {
    const recommendationsElement = document.getElementById('programmeRecommendations');
    if (!recommendationsElement) return;

    let recommendations = '<ul>';

    if (gap < -2) {
      recommendations += '<li>重點提升英文和數學成績</li>';
      recommendations += '<li>增加選修科目的練習時間</li>';
    } else if (gap < 0) {
      recommendations += '<li>保持現有水平，專注弱項科目</li>';
    } else {
      recommendations += '<li>保持優異成績，準備面試</li>';
    }

    recommendations += '<li>參加相關課外活動增強競爭力</li>';
    recommendations += '<li>了解課程具體要求和職業前景</li>';
    recommendations += '</ul>';

    recommendationsElement.innerHTML = recommendations;
  }

  updateCountdown() {
    const jupasDate = new Date('2026-07-16T09:00:00+08:00');
    
    const updateCountdown = () => {
      const now = new Date();
      const diff = jupasDate - now;

      if (diff <= 0) {
        const element = document.getElementById('jupasCountdown');
        if (element) element.textContent = 'JUPAS 已放榜';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      const element = document.getElementById('jupasCountdown');
      if (element) {
        element.textContent = `${days}天 ${hours}小時 ${minutes}分鐘`;
      }
    };

    updateCountdown();
    setInterval(updateCountdown, 60000); // Update every minute
  }

  getMockJUPASData() {
    return [
      {
        code: 'JS6001',
        name: '醫學內外全科醫學士',
        university: '香港大學',
        faculty: '醫學院',
        lq: 43.5,
        competition: '極高競爭',
        trend: '分數上升'
      },
      {
        code: 'JS6201',
        name: '工商管理學士',
        university: '香港中文大學',
        faculty: '商學院',
        lq: 28.5,
        competition: '高競爭',
        trend: '分數穩定'
      },
      {
        code: 'JS6301',
        name: '計算機科學學士',
        university: '香港科技大學',
        faculty: '工學院',
        lq: 32.0,
        competition: '高競爭',
        trend: '分數上升'
      }
    ];
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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Close modal function
function closeProgrammeModal() {
  const modal = document.getElementById('programmeModal');
  if (modal) modal.style.display = 'none';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.jupasManager = new JUPASManager();
});

// Make close function globally available
window.closeProgrammeModal = closeProgrammeModal;
