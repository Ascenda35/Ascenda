import { supabase, reportScore } from './supabase.js';

class AntiCheatManager {
  constructor() {
    this.suspicionThreshold = 3;
    this.maxUploadsPerHour = 3;
    this.init();
  }

  init() {
    console.log('Anti-cheat system initialized');
  }

  async validateScoreUpload(userId, scoreData) {
    const violations = [];

    // Check 1: Subject improvement anomaly
    const improvementViolation = await this.checkImprovementAnomaly(userId, scoreData);
    if (improvementViolation) {
      violations.push(improvementViolation);
    }

    // Check 2: Perfect scores on first upload
    const perfectScoreViolation = await this.checkPerfectScores(userId, scoreData);
    if (perfectScoreViolation) {
      violations.push(perfectScoreViolation);
    }

    // Check 3: Upload frequency
    const frequencyViolation = await this.checkUploadFrequency(userId);
    if (frequencyViolation) {
      violations.push(frequencyViolation);
    }

    // Check 4: Score consistency
    const consistencyViolation = await this.checkScoreConsistency(userId, scoreData);
    if (consistencyViolation) {
      violations.push(consistencyViolation);
    }

    // Check 5: Time-based patterns
    const timePatternViolation = await this.checkTimePatterns(userId, scoreData);
    if (timePatternViolation) {
      violations.push(timePatternViolation);
    }

    return {
      isValid: violations.length === 0,
      violations,
      requiresReview: violations.length > 0
    };
  }

  async checkImprovementAnomaly(userId, scoreData) {
    try {
      // Get previous scores for this subject
      const { data: previousScores, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', userId)
        .eq('subject', scoreData.subject)
        .eq('verification_status', 'verified')
        .order('upload_time', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (previousScores.length === 0) return null; // First upload, no comparison

      const lastScore = previousScores[0].score;
      const newScore = scoreData.score;
      const improvement = newScore - lastScore;

      // Define grade levels
      const gradeLevels = {
        1: 1,    // Grade 1
        2: 2,    // Grade 2
        3: 3,    // Grade 3
        4: 4,    // Grade 4
        5.5: 5,  // Grade 5
        7: 6,    // Grade 5*
        8.5: 7   // Grade 5**
      };

      const lastGradeLevel = gradeLevels[lastScore] || 0;
      const newGradeLevel = gradeLevels[newScore] || 0;
      const gradeImprovement = newGradeLevel - lastGradeLevel;

      // Flag if improvement is 2+ grade levels
      if (gradeImprovement >= 2) {
        return {
          type: 'improvement_anomaly',
          severity: 'high',
          message: `成績異常提升：從 ${this.getGradeFromScore(lastScore)} 跳升至 ${this.getGradeFromScore(newScore)}`,
          data: {
            previousScore: lastScore,
            newScore: newScore,
            improvement: gradeImprovement
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking improvement anomaly:', error);
      return null;
    }
  }

  async checkPerfectScores(userId, scoreData) {
    try {
      // Get all user's scores
      const { data: allScores, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', userId)
        .eq('verification_status', 'verified');

      if (error) throw error;

      // If this is a new upload, include it in the check
      const scoresToCheck = [...allScores];
      if (scoreData) {
        scoresToCheck.push(scoreData);
      }

      // Check if all subjects are 5** on first few uploads
      if (scoresToCheck.length <= 3) {
        const allPerfect = scoresToCheck.every(score => score.score >= 8.5);
        if (allPerfect && scoresToCheck.length >= 2) {
          return {
            type: 'perfect_scores',
            severity: 'high',
            message: '所有科目均為 5**，需要進一步驗證',
            data: {
              subjectCount: scoresToCheck.length,
              scores: scoresToCheck.map(s => ({ subject: s.subject, score: s.score }))
            }
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error checking perfect scores:', error);
      return null;
    }
  }

  async checkUploadFrequency(userId) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      const { data: recentUploads, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', userId)
        .gte('upload_time', oneHourAgo);

      if (error) throw error;

      if (recentUploads.length >= this.maxUploadsPerHour) {
        return {
          type: 'frequency_violation',
          severity: 'medium',
          message: `一小時內上載 ${recentUploads.length} 份成績，超過限制`,
          data: {
            uploadCount: recentUploads.length,
            maxAllowed: this.maxUploadsPerHour,
            timeWindow: '1小時'
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking upload frequency:', error);
      return null;
    }
  }

  async checkScoreConsistency(userId, scoreData) {
    try {
      // Get user's score history for this subject
      const { data: subjectScores, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', userId)
        .eq('subject', scoreData.subject)
        .eq('verification_status', 'verified')
        .order('upload_time', { ascending: true });

      if (error) throw error;

      if (subjectScores.length < 3) return null; // Not enough data

      // Calculate standard deviation
      const scores = subjectScores.map(s => s.score);
      const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
      const stdDev = Math.sqrt(variance);

      // Check for unusual patterns
      if (stdDev > 3) { // High variance might indicate inconsistent reporting
        return {
          type: 'inconsistency',
          severity: 'medium',
          message: `${scoreData.subject} 成績波動較大，需要審核`,
          data: {
            subject: scoreData.subject,
            standardDeviation: stdDev.toFixed(2),
            scores: scores
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking score consistency:', error);
      return null;
    }
  }

  async checkTimePatterns(userId, scoreData) {
    try {
      // Check if uploads always happen at the same time (possible automation)
      const { data: timeScores, error } = await supabase
        .from('scores')
        .select('upload_time')
        .eq('user_id', userId)
        .order('upload_time', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (timeScores.length < 5) return null;

      // Extract hours from upload times
      const hours = timeScores.map(score => {
        const date = new Date(score.upload_time);
        return date.getHours();
      });

      // Check if all uploads happen within a 2-hour window
      const minHour = Math.min(...hours);
      const maxHour = Math.max(...hours);
      const hourRange = maxHour - minHour;

      if (hourRange <= 2 && hours.length >= 5) {
        return {
          type: 'time_pattern',
          severity: 'low',
          message: '上載時間模式異常，可能為自動化操作',
          data: {
            hourRange: hourRange,
            uploadHours: hours
          }
        };
      }

      return null;
    } catch (error) {
      console.error('Error checking time patterns:', error);
      return null;
    }
  }

  async flagScore(scoreId, reporterId, reason, violationType) {
    try {
      await reportScore(reporterId, scoreId, reason);

      // Update score flag count
      const { data: score, error: fetchError } = await supabase
        .from('scores')
        .select('flag_count')
        .eq('id', scoreId)
        .single();

      if (fetchError) throw fetchError;

      const newFlagCount = (score.flag_count || 0) + 1;

      await supabase
        .from('scores')
        .update({ 
          flag_count: newFlagCount,
          verification_status: newFlagCount >= this.suspicionThreshold ? 'flagged' : 'pending'
        })
        .eq('id', scoreId);

      return {
        success: true,
        flagCount: newFlagCount,
        autoFlagged: newFlagCount >= this.suspicionThreshold
      };
    } catch (error) {
      console.error('Error flagging score:', error);
      return { success: false, error: error.message };
    }
  }

  async getSuspiciousScores(limit = 50) {
    try {
      const { data, error } = await supabase
        .from('scores')
        .select(`
          *,
          users!inner(email, display_name)
        `)
        .or('flag_count.gte.2,verification_status.eq.pending')
        .order('flag_count', { ascending: false })
        .order('upload_time', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error getting suspicious scores:', error);
      return [];
    }
  }

  async generateUserRiskProfile(userId) {
    try {
      // Get all user scores
      const { data: scores, error } = await supabase
        .from('scores')
        .select('*')
        .eq('user_id', userId);

      if (error) throw error;

      const riskFactors = {
        flaggedScores: 0,
        pendingScores: 0,
        totalUploads: scores.length,
        averageScore: 0,
        scoreVariance: 0,
        uploadFrequency: 0,
        riskScore: 0
      };

      // Calculate risk factors
      scores.forEach(score => {
        if (score.verification_status === 'flagged') riskFactors.flaggedScores++;
        if (score.verification_status === 'pending') riskFactors.pendingScores++;
      });

      if (scores.length > 0) {
        const scoreValues = scores.map(s => s.score);
        riskFactors.averageScore = scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length;
        
        const variance = scoreValues.reduce((sum, score) => sum + Math.pow(score - riskFactors.averageScore, 2), 0) / scoreValues.length;
        riskFactors.scoreVariance = Math.sqrt(variance);
      }

      // Calculate upload frequency (uploads per week)
      if (scores.length > 1) {
        const firstUpload = new Date(Math.min(...scores.map(s => new Date(s.upload_time))));
        const lastUpload = new Date(Math.max(...scores.map(s => new Date(s.upload_time))));
        const weeksDiff = (lastUpload - firstUpload) / (1000 * 60 * 60 * 24 * 7);
        riskFactors.uploadFrequency = weeksDiff > 0 ? scores.length / weeksDiff : scores.length;
      }

      // Calculate overall risk score (0-100)
      riskFactors.riskScore = Math.min(100, 
        (riskFactors.flaggedScores * 20) +
        (riskFactors.pendingScores * 10) +
        (riskFactors.scoreVariance * 5) +
        (riskFactors.uploadFrequency > 10 ? 15 : 0)
      );

      return riskFactors;
    } catch (error) {
      console.error('Error generating risk profile:', error);
      return null;
    }
  }

  getGradeFromScore(score) {
    if (score >= 8.5) return '5**';
    if (score >= 7) return '5*';
    if (score >= 5.5) return '5';
    if (score >= 4) return '4';
    if (score >= 3) return '3';
    if (score >= 2) return '2';
    return '1';
  }

  // Public method to validate any score upload
  async validateUpload(userId, scoreData) {
    const validation = await this.validateScoreUpload(userId, scoreData);
    
    if (validation.requiresReview) {
      console.warn('Score upload requires review:', validation.violations);
      
      // Auto-flag if high severity violations
      const highSeverityViolations = validation.violations.filter(v => v.severity === 'high');
      if (highSeverityViolations.length > 0) {
        // Mark as pending review
        scoreData.verification_status = 'pending';
      }
    }

    return validation;
  }
}

// Initialize anti-cheat system
document.addEventListener('DOMContentLoaded', () => {
  window.antiCheatManager = new AntiCheatManager();
});

export default AntiCheatManager;
