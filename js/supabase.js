const SUPABASE_URL = 'https://wlaashyqdvpggyfnkihc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsYWFzaHlxZHZwZ2d5Zm5raWhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTMwNDksImV4cCI6MjA4OTU4OTA0OX0.XDQPnAgW0CHPJJCm2zJPittXXke4Iu4bDo-md9HDnuI';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth helper functions
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'https://ascenda35.github.io/'
    }
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// User profile functions
export async function getUserProfile(userId) {
  if (!userId) return null;
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function createUserProfile(user) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: user.id,
      email: user.email,
      display_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// School verification functions
export async function getSchools() {
  const { data, error } = await supabase
    .from('schools')
    .select('*')
    .eq('verified', true)
    .order('name_en');
  
  if (error) throw error;
  return data;
}

export async function createOTPVerification(userId, schoolEmail, otpCode) {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  const { data, error } = await supabase
    .from('otp_verifications')
    .insert({
      user_id: userId,
      school_email: schoolEmail,
      otp_code: otpCode,
      expires_at: expiresAt.toISOString()
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function verifyOTP(userId, otpCode) {
  const { data, error } = await supabase
    .from('otp_verifications')
    .select('*')
    .eq('user_id', userId)
    .eq('otp_code', otpCode)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .single();
  
  if (error) return null;
  
  // Mark OTP as used
  await supabase
    .from('otp_verifications')
    .update({ used: true })
    .eq('id', data.id);
  
  return data;
}

// Score functions
export async function uploadScore(userId, scoreData) {
  const { data, error } = await supabase
    .from('scores')
    .insert({
      user_id: userId,
      ...scoreData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getUserScores(userId) {
  const { data, error } = await supabase
    .from('scores')
    .select('*')
    .eq('user_id', userId)
    .order('upload_time', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function getLeaderboard(boardType = 'general', limit = 100) {
  let query = supabase
    .from('users')
    .select(`
      id,
      display_name,
      school_verified,
      monthly_points,
      streak,
      target_jupas_code,
      schools(name_en, name_tc)
    `)
    .eq('monthly_points', '>', 0)
    .order('monthly_points', { ascending: false })
    .limit(limit);
  
  // Apply board type filters
  if (boardType === 'verified') {
    query = query.eq('school_verified', true);
  } else if (boardType === 'elite') {
    query = query.eq('school_verified', true).gte('monthly_points', 100);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  // Get scores for each user
  const usersWithScores = await Promise.all(
    data.map(async (user) => {
      const { data: scores } = await supabase
        .from('scores')
        .select('score, subject')
        .eq('user_id', user.id)
        .eq('verification_status', 'verified');
      
      const totalScore = scores?.reduce((sum, score) => sum + score.score, 0) || 0;
      
      return {
        ...user,
        totalScore,
        subjectCount: scores?.length || 0
      };
    })
  );
  
  return usersWithScores.sort((a, b) => b.totalScore - a.totalScore);
}

export async function reportScore(reporterId, scoreId, reason) {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      target_score_id: scoreId,
      reason
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Grading queue functions
export async function getNextGradingItem(userId) {
  const { data, error } = await supabase
    .from('grading_queue')
    .select('*')
    .eq('status', 'pending')
    .neq('uploader_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function submitReview(reviewerId, queueItemId, score) {
  const { data, error } = await supabase
    .from('reviews')
    .insert({
      reviewer_id: reviewerId,
      queue_item_id: queueItemId,
      given_score: score
    })
    .select()
    .single();
  
  if (error) throw error;
  
  // Update queue item review count
  await supabase
    .from('grading_queue')
    .update({ reviewer_count: supabase.raw('reviewer_count + 1') })
    .eq('id', queueItemId);
  
  return data;
}

export async function addToGradingQueue(uploaderId, itemData) {
  const { data, error } = await supabase
    .from('grading_queue')
    .insert({
      uploader_id: uploaderId,
      ...itemData
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Badge functions
export async function awardBadge(userId, badgeType) {
  const { data, error } = await supabase
    .from('badges')
    .insert({
      user_id: userId,
      badge_type: badgeType
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getUserBadges(userId) {
  const { data, error } = await supabase
    .from('badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

// Token management
export async function updateUserTokens(userId, tokens) {
  const { data, error } = await supabase
    .from('users')
    .update({ tokens })
    .eq('id', userId)
    .select('tokens')
    .single();
  
  if (error) throw error;
  return data.tokens;
}

export async function addTokens(userId, amount) {
  const { data, error } = await supabase
    .from('users')
    .update({ 
      tokens: supabase.raw('GREATEST(tokens + ?, 0)', [amount]),
      monthly_points: supabase.raw('monthly_points + ?', [amount])
    })
    .eq('id', userId)
    .select('tokens, monthly_points')
    .single();
  
  if (error) throw error;
  return data;
}

// Streak management
export async function updateStreak(userId) {
  const { data: user } = await getUserProfile(userId);
  if (!user) throw new Error('User not found');
  
  const lastActivity = new Date(user.updated_at);
  const today = new Date();
  const diffDays = Math.floor((today - lastActivity) / (1000 * 60 * 60 * 24));
  
  let newStreak = user.streak || 0;
  if (diffDays === 1) {
    newStreak += 1;
  } else if (diffDays > 1) {
    newStreak = 1;
  }
  
  const { data, error } = await supabase
    .from('users')
    .update({ streak: newStreak })
    .eq('id', userId)
    .select('streak')
    .single();
  
  if (error) throw error;
  
  // Award streak badges
  if (newStreak === 7) {
    await awardBadge(userId, 'weekly_streak');
  } else if (newStreak === 30) {
    await awardBadge(userId, 'monthly_streak');
  }
  
  return data.streak;
}

// Real-time subscriptions
export function subscribeToLeaderboard(callback) {
  return supabase
    .channel('leaderboard')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'users' 
      }, 
      callback
    )
    .subscribe();
}

export function subscribeToScores(userId, callback) {
  return supabase
    .channel(`scores-${userId}`)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'scores',
        filter: `user_id=eq.${userId}`
      }, 
      callback
    )
    .subscribe();
}

// Utility functions
export function calculateJUPASScore(subjects) {
  const gradingScale = {
    '5**': 8.5,
    '5*': 7,
    '5': 5.5,
    '4': 4,
    '3': 3,
    '2': 2,
    '1': 1
  };
  
  return subjects
    .map(subject => gradingScale[subject] || 0)
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((sum, score) => sum + score, 0);
}

export function getGradeFromScore(score) {
  if (score >= 8.5) return '5**';
  if (score >= 7) return '5*';
  if (score >= 5.5) return '5';
  if (score >= 4) return '4';
  if (score >= 3) return '3';
  if (score >= 2) return '2';
  return '1';
}

export function isUploadAllowed() {
  const hkHour = new Date().toLocaleString('en-US', {
    timeZone: 'Asia/Hong_Kong',
    hour: 'numeric',
    hour12: false
  });
  return parseInt(hkHour) >= 7;
}

export function getTimeUntilUploadAllowed() {
  const now = new Date();
  const hkTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Hong_Kong"}));
  const hkHour = hkTime.getHours();
  
  if (hkHour >= 7) return null;
  
  const nextAllowed = new Date(hkTime);
  nextAllowed.setHours(7, 0, 0, 0);
  if (nextAllowed <= hkTime) {
    nextAllowed.setDate(nextAllowed.getDate() + 1);
  }
  
  const diff = nextAllowed - hkTime;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes };
}

// Error handling
export function handleSupabaseError(error) {
  console.error('Supabase error:', error);
  
  if (error.code === 'PGRST116') {
    return 'Record not found';
  } else if (error.code === '23505') {
    return 'Duplicate entry';
  } else if (error.code === '42501') {
    return 'Permission denied';
  } else {
    return error.message || 'An error occurred';
  }
}
