export type SleepQuality = 'Poor' | 'Average' | 'Good';
export type PhysicalActivity = 'None' | 'Light' | 'Regular';
export type DeadlinePressure = 'Low' | 'Medium' | 'High';

export interface UserInputs {
  sleepHours: number;
  sleepQuality: SleepQuality;
  studyHours: number;
  mood: number; // 1 to 5
  screenTime: number;
  physicalActivity: PhysicalActivity;
  deadlinePressure: DeadlinePressure;
}

export interface AnalysisResult {
  stressLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  score: number; // 0-100
  behaviorTag: string;
  riskAlert: string;
  advice: string;
  aiExplanation: string;
}

export interface AnalysisHistoryItem {
  id: string;
  inputs: UserInputs;
  result: AnalysisResult;
  timestamp: number;
}

export interface ChatHistoryItem {
  id: string;
  userMessage: string;
  aiResponse: string;
  timestamp: number;
}

export interface UserProfile {
  uid: string;
  username: string;
  email?: string;
  bio?: string;
  goal?: string;
  avatarUrl?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface PlannerInputs {
  wakeUpTime: string;
  sleepTime: string;
  studyHoursRequired: number;
  screenTimeLimit: number;
  physicalActivityMinutes: number;
  customActivities: string;
}

export interface DailyPlanItem {
  time: string;
  activity: string;
  type: 'study' | 'break' | 'sleep' | 'other';
}

export interface PlannerHistoryItem {
  id: string;
  inputs: PlannerInputs;
  plan: DailyPlanItem[];
  timestamp: number;
}

export interface ActivityLogItem {
  id: string;
  action: string;
  timestamp: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
}

export interface EmotionalAnalysis {
  emotion: string;
  reason: string;
  suggestion: string;
}

export interface JournalHistoryItem {
  id: string;
  text: string;
  analysis: EmotionalAnalysis;
  timestamp: number;
}

export interface WeeklyReport {
  summary: string;
  stressTrend: 'Improving' | 'Stable' | 'Declining';
  keyInsights: string[];
  recommendations: string[];
}

export interface AppHistory {
  analyzer: AnalysisHistoryItem[];
  planner: PlannerHistoryItem[];
  chat: ChatHistoryItem[];
  activity_log: ActivityLogItem[];
  journal: JournalHistoryItem[];
}
