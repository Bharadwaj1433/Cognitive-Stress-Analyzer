import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Smile, 
  Monitor, 
  Activity, 
  AlertTriangle, 
  Brain, 
  Send, 
  RefreshCw,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  User,
  Lock,
  LogOut,
  Heart,
  History,
  Trash2,
  Clock,
  Calendar,
  Moon,
  Sun,
  Layout,
  Coffee,
  Check,
  Camera,
  Bell,
  X,
  TrendingUp,
  BarChart3,
  PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserInputs, AnalysisResult, ChatMessage, SleepQuality, PhysicalActivity, DeadlinePressure, UserProfile, AnalysisHistoryItem, ChatHistoryItem, PlannerInputs, DailyPlanItem, AppHistory, PlannerHistoryItem, ActivityLogItem, NotificationItem, EmotionalAnalysis, JournalHistoryItem, WeeklyReport } from './types';
import { analyzeStress, getTherapistResponse, generateDailyPlan, analyzeEmotion, generateWeeklyReport } from './lib/gemini';
import { auth, db } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, orderBy, limit, getDocs, addDoc, deleteDoc, writeBatch, where } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DEFAULT_INPUTS: UserInputs = {
  sleepHours: 7,
  sleepQuality: 'Average',
  studyHours: 4,
  mood: 3,
  screenTime: 5,
  physicalActivity: 'Light',
  deadlinePressure: 'Medium',
};

const DEFAULT_PLANNER_INPUTS: PlannerInputs = {
  wakeUpTime: '07:00',
  sleepTime: '23:00',
  studyHoursRequired: 4,
  screenTimeLimit: 3,
  physicalActivityMinutes: 30,
  customActivities: 'Gym, Reading',
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');

  const [inputs, setInputs] = useState<UserInputs>(DEFAULT_INPUTS);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChat, setCurrentChat] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showTherapist, setShowTherapist] = useState(false);
  const [view, setView] = useState<'analyzer' | 'history' | 'planner' | 'profile' | 'journal'>('analyzer');
  
  const [history, setHistory] = useState<AppHistory>({
    analyzer: [],
    planner: [],
    chat: [],
    activity_log: [],
    journal: []
  });

  const [plannerInputs, setPlannerInputs] = useState<PlannerInputs>(DEFAULT_PLANNER_INPUTS);
  const [dailyPlan, setDailyPlan] = useState<DailyPlanItem[]>([]);
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [journalAnalysis, setJournalAnalysis] = useState<EmotionalAnalysis | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const addNotification = (title: string, message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newNotification: NotificationItem = {
      id: crypto.randomUUID(),
      title,
      message,
      type,
      timestamp: Date.now(),
      read: false
    };
    setNotifications(prev => [newNotification, ...prev]);

    // Browser Notification
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body: message });
    }
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        addNotification("Notifications Enabled", "You will now receive important updates and reminders.", "success");
      }
    }
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const logActivity = async (action: string) => {
    if (!user) return;
    const logItem: ActivityLogItem = {
      id: crypto.randomUUID(),
      action,
      timestamp: Date.now(),
    };
    
    setHistory(prev => ({
      ...prev,
      activity_log: [logItem, ...prev.activity_log]
    }));

    try {
      await addDoc(collection(db, 'users', user.uid, 'activity_log'), logItem);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/activity_log`);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUser({ 
              uid: firebaseUser.uid, 
              username: data.username,
              email: data.email,
              bio: data.bio,
              goal: data.goal,
              avatarUrl: data.avatarUrl
            });
          } else {
            const username = firebaseUser.displayName || 'User';
            const newUser = {
              username: username,
              email: firebaseUser.email || '',
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, newUser);
            setUser({ 
              uid: firebaseUser.uid, 
              username: username,
              email: firebaseUser.email || ''
            });
          }

          // Fetch History from Firestore
          const [analyzerSnap, plannerSnap, chatSnap, activitySnap, journalSnap] = await Promise.all([
            getDocs(query(collection(db, 'users', firebaseUser.uid, 'analyzer_history'), orderBy('timestamp', 'desc'), limit(50))),
            getDocs(query(collection(db, 'users', firebaseUser.uid, 'planner_history'), orderBy('timestamp', 'desc'), limit(50))),
            getDocs(query(collection(db, 'users', firebaseUser.uid, 'chat_history'), orderBy('timestamp', 'desc'), limit(50))),
            getDocs(query(collection(db, 'users', firebaseUser.uid, 'activity_log'), orderBy('timestamp', 'desc'), limit(50))),
            getDocs(query(collection(db, 'users', firebaseUser.uid, 'journal_history'), orderBy('timestamp', 'desc'), limit(50)))
          ]);

          const analyzerHistory = analyzerSnap.docs.map(d => d.data() as AnalysisHistoryItem);
          const plannerHistory = plannerSnap.docs.map(d => d.data() as PlannerHistoryItem);
          const chatHistory = chatSnap.docs.map(d => d.data() as ChatHistoryItem);
          const activityLog = activitySnap.docs.map(d => d.data() as ActivityLogItem);
          const journalHistory = journalSnap.docs.map(d => d.data() as JournalHistoryItem);

          setHistory({
            analyzer: analyzerHistory,
            planner: plannerHistory,
            chat: chatHistory,
            activity_log: activityLog,
            journal: journalHistory
          });

          // Restore latest state
          if (analyzerHistory.length > 0) {
            setResult(analyzerHistory[0].result);
            setInputs(analyzerHistory[0].inputs);
          }
          if (plannerHistory.length > 0) {
            setDailyPlan(plannerHistory[0].plan);
            setPlannerInputs(plannerHistory[0].inputs);
          }

          // Log login activity
          const logItem: ActivityLogItem = {
            id: crypto.randomUUID(),
            action: 'User login',
            timestamp: Date.now(),
          };
          await addDoc(collection(db, 'users', firebaseUser.uid, 'activity_log'), logItem);
          setHistory(prev => ({
            ...prev,
            activity_log: [logItem, ...prev.activity_log]
          }));

        } catch (error) {
          console.error("Error fetching user data/history:", error);
        }
      } else {
        setUser(null);
        setHistory({ analyzer: [], planner: [], chat: [], activity_log: [], journal: [] });
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setAuthLoading(true);
    setLoginError('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError('Google Sign-In failed. Please ensure popups are allowed in your browser.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setLoginError('This domain is not authorized for Google Sign-In. Please add it to your Firebase Console (Authentication > Settings > Authorized domains).');
      } else if (error.code === 'auth/cancelled-popup-request') {
        setLoginError('Sign-in was cancelled. Please try again.');
      } else {
        setLoginError(`Google Sign-In failed: ${error.message || 'Unknown error'}. Please ensure popups are allowed.`);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !signupUsername) {
      setLoginError('Please fill in all fields.');
      return;
    }
    setAuthLoading(true);
    setLoginError('');
    try {
      // Check if username is unique
      const q = query(collection(db, 'users'), where('username', '==', signupUsername));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setLoginError('Username already taken. Please choose another one.');
        setAuthLoading(false);
        return;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: signupUsername });
      
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        username: signupUsername,
        email: email,
        createdAt: serverTimestamp()
      });
    } catch (error: any) {
      console.error("Signup failed:", error);
      if (error.code === 'auth/email-already-in-use') {
        setLoginError('Email already in use. Please try logging in.');
      } else if (error.code === 'auth/weak-password') {
        setLoginError('Password is too weak. Please use at least 6 characters.');
      } else {
        setLoginError(error.message || 'Signup failed. Please try again.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError('Please fill in all fields.');
      return;
    }
    setAuthLoading(true);
    setLoginError('');
    try {
      let loginEmail = email;
      // Check if input is an email or username
      if (!email.includes('@')) {
        const q = query(collection(db, 'users'), where('username', '==', email));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setLoginError('Invalid username or email.');
          setAuthLoading(false);
          return;
        }
        const userData = querySnapshot.docs[0].data();
        if (!userData.email) {
          setLoginError('Could not find email associated with this username.');
          setAuthLoading(false);
          return;
        }
        loginEmail = userData.email;
      }

      await signInWithEmailAndPassword(auth, loginEmail, password);
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setLoginError('Invalid email/username or password.');
      } else if (error.code === 'auth/invalid-email') {
        setLoginError('Invalid email format.');
      } else {
        setLoginError('Login failed. Please check your credentials.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setResult(null);
    setChatMessages([]);
    setView('analyzer');
  };

  const clearHistory = async () => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to clear all history? This cannot be undone.')) return;
    
    try {
      const collections = ['analyzer_history', 'planner_history', 'chat_history', 'activity_log', 'journal_history'];
      
      for (const collName of collections) {
        const q = query(collection(db, 'users', user.uid, collName));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      setHistory({
        analyzer: [],
        planner: [],
        chat: [],
        activity_log: [],
        journal: []
      });
      logActivity('History cleared');
      alert('History cleared successfully.');
    } catch (error) {
      console.error("Error clearing history:", error);
      alert('Failed to clear history.');
    }
  };

  const handleAnalyze = async () => {
    if (!user) return;
    setLoading(true);
    logActivity('Analyze button click');
    try {
      const analysis = await analyzeStress(inputs);
      setResult(analysis);
      
      const historyItem: AnalysisHistoryItem = {
        id: crypto.randomUUID(),
        inputs: { ...inputs },
        result: analysis,
        timestamp: Date.now(),
      };
      setHistory(prev => ({
        ...prev,
        analyzer: [historyItem, ...prev.analyzer]
      }));

      await addDoc(collection(db, 'users', user.uid, 'analyzer_history'), historyItem);
      
      addNotification(
        "Analysis Complete", 
        `Your stress level is ${analysis.stressLevel}. Check the advice for tips.`, 
        analysis.stressLevel === 'Critical' || analysis.stressLevel === 'High' ? 'warning' : 'success'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/analyzer_history`);
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePlan = async () => {
    if (!user) return;
    setPlannerLoading(true);
    logActivity('Plan generation click');
    try {
      const plan = await generateDailyPlan(plannerInputs, result?.stressLevel || 'Unknown');
      setDailyPlan(plan);

      const historyItem: PlannerHistoryItem = {
        id: crypto.randomUUID(),
        inputs: { ...plannerInputs },
        plan: plan,
        timestamp: Date.now(),
      };
      setHistory(prev => ({
        ...prev,
        planner: [historyItem, ...prev.planner]
      }));

      await addDoc(collection(db, 'users', user.uid, 'planner_history'), historyItem);
      
      addNotification(
        "Plan Generated", 
        "Your personalized daily plan is ready. Let's stay productive!", 
        "success"
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/planner_history`);
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleAnalyzeJournal = async () => {
    if (!user || !journalText.trim()) return;
    setJournalLoading(true);
    logActivity('Journal analysis click');
    try {
      const analysis = await analyzeEmotion(journalText);
      setJournalAnalysis(analysis);
      
      const historyItem: JournalHistoryItem = {
        id: crypto.randomUUID(),
        text: journalText,
        analysis: analysis,
        timestamp: Date.now(),
      };
      setHistory(prev => ({
        ...prev,
        journal: [historyItem, ...prev.journal]
      }));

      await addDoc(collection(db, 'users', user.uid, 'journal_history'), historyItem);
      
      addNotification(
        "Journal Analyzed", 
        "Your emotional insight is ready. Check the results below.", 
        "success"
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/journal_history`);
    } finally {
      setJournalLoading(false);
    }
  };

  const handleGenerateWeeklyReport = async () => {
    if (!user || !history.analyzer || history.analyzer.length === 0) {
      addNotification("No Data", "You need at least one analysis entry to generate a report.", "info");
      return;
    }
    setWeeklyLoading(true);
    logActivity('Weekly report generation');
    try {
      // Prepare data for Gemini
      const lastWeekHistory = history.analyzer.slice(0, 7).filter(h => h && h.result && h.inputs);
      
      if (lastWeekHistory.length === 0) {
        throw new Error("No valid history entries found.");
      }

      const historyData = lastWeekHistory.map(h => 
        `Date: ${new Date(h.timestamp).toLocaleDateString()}, Stress: ${h.result.stressLevel || 'Unknown'}, Score: ${h.result.score || 0}, Mood: ${h.inputs.mood || 0}/5`
      ).join('\n');

      const avgSleep = lastWeekHistory.reduce((acc, h) => acc + (h.inputs.sleepHours || 0), 0) / lastWeekHistory.length;
      const avgStudy = lastWeekHistory.reduce((acc, h) => acc + (h.inputs.studyHours || 0), 0) / lastWeekHistory.length;
      
      const weeklyData = `Avg Sleep: ${avgSleep.toFixed(1)}h, Avg Study: ${avgStudy.toFixed(1)}h, Total Entries: ${lastWeekHistory.length}`;

      const userText = user.goal ? `User Goal: ${user.goal}` : "No specific goal set.";

      const report = await generateWeeklyReport(historyData, weeklyData, userText);
      setWeeklyReport(report);
      
      addNotification(
        "Weekly Report Ready", 
        "Your cognitive trend analysis for the past week is now available.", 
        "success"
      );
    } catch (error: any) {
      console.error("Error generating weekly report:", error);
      const errorMsg = error?.message || "Could not generate weekly insights. Please try again later.";
      addNotification("Report Failed", errorMsg, "error");
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleChatSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChat.trim() || chatLoading || !user) return;

    const userMsg: ChatMessage = { role: 'user', text: currentChat };
    setChatMessages(prev => [...prev, userMsg]);
    setCurrentChat('');
    setChatLoading(true);

    try {
      const response = await getTherapistResponse(chatMessages, currentChat, result);
      const modelMsg: ChatMessage = { role: 'model', text: response || "I'm here to listen. Could you tell me more?" };
      setChatMessages(prev => [...prev, modelMsg]);

      const chatItem: ChatHistoryItem = {
        id: crypto.randomUUID(),
        userMessage: currentChat,
        aiResponse: response || "I'm here to listen. Could you tell me more?",
        timestamp: Date.now(),
      };
      setHistory(prev => ({
        ...prev,
        chat: [chatItem, ...prev.chat]
      }));

      await addDoc(collection(db, 'users', user.uid, 'chat_history'), chatItem);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${user.uid}/chat_history`);
    } finally {
      setChatLoading(false);
    }
  };

  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    if (!user) return;
    try {
      const profileToUpdate = { ...updatedProfile };
      if (avatarPreview) {
        profileToUpdate.avatarUrl = avatarPreview;
      }

      await setDoc(doc(db, 'users', user.uid), {
        ...profileToUpdate,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setUser(prev => prev ? { ...prev, ...profileToUpdate } : null);
      setAvatarPreview(null);
      logActivity('Profile updated');
      alert('Profile updated successfully!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File is too large. Please select an image under 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setAvatarPreview(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };
  const getStressColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-emerald-500 bg-emerald-50 border-emerald-200';
      case 'Moderate': return 'text-amber-500 bg-amber-50 border-amber-200';
      case 'High': return 'text-orange-500 bg-orange-50 border-orange-200';
      case 'Critical': return 'text-rose-500 bg-rose-50 border-rose-200';
      default: return 'text-slate-500 bg-slate-50 border-slate-200';
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-3xl shadow-xl border border-slate-200 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-100">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-slate-800">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-slate-500 text-sm mt-2">
              {authMode === 'login' 
                ? 'Sign in to access your cognitive analysis' 
                : 'Join us for a better cognitive experience'}
            </p>
          </div>

          <div className="space-y-4">
            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {loginError}
              </div>
            )}

            <form onSubmit={authMode === 'login' ? handleEmailLogin : handleEmailSignup} className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Username</label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      placeholder="Your name"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Email</label>
                <div className="relative">
                  <Send className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-white px-2 text-slate-400 font-bold tracking-widest">Or continue with</span>
              </div>
            </div>

            <button 
              onClick={handleLogin}
              disabled={authLoading}
              className="w-full py-4 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold shadow-md border border-slate-200 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>

            <div className="text-center mt-6">
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 transition-colors duration-300">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 transition-colors duration-300">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">Cognitive Stress Analyzer</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setView('analyzer')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  view === 'analyzer' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Brain className="w-4 h-4" /> Analyzer
              </button>
              <button 
                onClick={() => setView('history')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  view === 'history' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <History className="w-4 h-4" /> History
              </button>
              <button 
                onClick={() => setView('planner')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  view === 'planner' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Calendar className="w-4 h-4" /> Planner
              </button>
              <button 
                onClick={() => setView('journal')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${
                  view === 'journal' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BookOpen className="w-4 h-4" /> Journal
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full cursor-pointer hover:bg-slate-200 transition-all" onClick={() => setView('profile')}>
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-700">{user.username}</span>
            </div>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 text-slate-400 hover:text-indigo-600 transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Bell className="w-4 h-4 text-indigo-600" /> Notifications
                      </h3>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={clearNotifications}
                          className="text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors"
                        >
                          Clear All
                        </button>
                        <button 
                          onClick={() => setShowNotifications(false)}
                          className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Bell className="w-6 h-6 text-slate-300" />
                          </div>
                          <p className="text-sm text-slate-500 font-medium">No notifications yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {notifications.map(notification => (
                            <div 
                              key={notification.id}
                              className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${!notification.read ? 'bg-indigo-50/30' : ''}`}
                              onClick={() => markNotificationAsRead(notification.id)}
                            >
                              <div className="flex gap-3">
                                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                                  notification.type === 'success' ? 'bg-emerald-500' :
                                  notification.type === 'warning' ? 'bg-amber-500' :
                                  notification.type === 'error' ? 'bg-rose-500' : 'bg-indigo-500'
                                }`} />
                                <div className="flex-1">
                                  <h4 className="text-sm font-bold text-slate-800 leading-tight mb-1">{notification.title}</h4>
                                  <p className="text-xs text-slate-500 leading-relaxed mb-2">{notification.message}</p>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {Notification.permission !== 'granted' && (
                      <div className="p-3 bg-indigo-600">
                        <button 
                          onClick={requestNotificationPermission}
                          className="w-full py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          Enable Browser Notifications
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {view === 'journal' ? (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
              <div className="p-8 border-b border-slate-100 bg-indigo-50/30">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-600 rounded-xl">
                    <BookOpen className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-800">Emotional Journal Analysis</h2>
                </div>
                <p className="text-slate-500 font-medium">Write down your thoughts and get instant emotional insights.</p>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Send className="w-4 h-4 text-indigo-500" /> Your Journal Entry
                  </label>
                  <textarea
                    value={journalText}
                    onChange={(e) => setJournalText(e.target.value)}
                    placeholder="How are you feeling today? What's on your mind?"
                    className="w-full h-48 p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-slate-700 font-medium resize-none"
                  />
                </div>

                <button
                  onClick={handleAnalyzeJournal}
                  disabled={journalLoading || !journalText.trim()}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-3"
                >
                  {journalLoading ? (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Brain className="w-6 h-6" /> Analyze Emotional Condition
                    </>
                  )}
                </button>

                <AnimatePresence>
                  {journalAnalysis && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 pt-6 border-t border-slate-100"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                          <p className="text-[10px] font-black text-rose-600 uppercase mb-1">Emotion</p>
                          <p className="text-lg font-bold text-rose-900">{journalAnalysis.emotion}</p>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                          <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Reason</p>
                          <p className="text-sm font-medium text-amber-900 leading-relaxed">{journalAnalysis.reason}</p>
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Suggestion</p>
                          <p className="text-sm font-medium text-emerald-900 leading-relaxed">{journalAnalysis.suggestion}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Journal History */}
            <div className="space-y-4">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" /> Recent Insights
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.journal.length === 0 ? (
                  <div className="col-span-full p-12 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <BookOpen className="w-12 h-12 opacity-20" />
                    <p className="font-bold">No journal entries analyzed yet.</p>
                  </div>
                ) : (
                  history.journal.map((item) => (
                    <div key={item.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-black uppercase">
                          {item.analysis.emotion}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 italic line-clamp-2">"{item.text}"</p>
                      <div className="pt-4 border-t border-slate-50 space-y-2">
                        <p className="text-xs font-bold text-slate-800">Reason: <span className="font-medium text-slate-500">{item.analysis.reason}</span></p>
                        <p className="text-xs font-bold text-slate-800">Suggestion: <span className="font-medium text-slate-500">{item.analysis.suggestion}</span></p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.section>
        ) : view === 'history' ? (
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-800">History Dashboard</h2>
                <p className="text-slate-500 text-sm">Full activity tracking and cognitive records.</p>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleGenerateWeeklyReport}
                  disabled={weeklyLoading || history.analyzer.length === 0}
                  className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 rounded-xl text-sm font-bold transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"
                >
                  {weeklyLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                  Generate Weekly Insights
                </button>
                <button 
                  onClick={clearHistory}
                  className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Clear All History
                </button>
              </div>
            </div>

            <AnimatePresence>
              {weeklyReport && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-3xl shadow-xl border border-indigo-100 overflow-hidden"
                >
                  <div className="p-6 border-b border-indigo-50 bg-indigo-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-xl">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800">Weekly Cognitive Report</h3>
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Trend: {weeklyReport.stressTrend}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setWeeklyReport(null)}
                      className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-500" /> Summary
                      </h4>
                      <p className="text-slate-600 leading-relaxed font-medium">{weeklyReport.summary}</p>
                      
                      <div className="pt-4 space-y-3">
                        <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Key Insights
                        </h4>
                        <ul className="space-y-2">
                          {weeklyReport.keyInsights.map((insight, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600 font-medium">
                              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 rounded-2xl p-6 space-y-4 border border-slate-100">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <Brain className="w-4 h-4 text-indigo-500" /> Recommendations
                      </h4>
                      <div className="space-y-3">
                        {weeklyReport.recommendations.map((rec, i) => (
                          <div key={i} className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                            <div className="p-1.5 bg-indigo-50 rounded-lg">
                              <Heart className="w-3.5 h-3.5 text-indigo-600" />
                            </div>
                            <p className="text-xs font-bold text-slate-700 leading-relaxed">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Analyzer History */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-slate-800">Analyzer History</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {history.analyzer.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <Activity className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No analysis records yet.</p>
                    </div>
                  ) : (
                    history.analyzer.map((item) => (
                      <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${getStressColor(item.result.stressLevel)}`}>
                            {item.result.stressLevel}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-700">{item.result.behaviorTag}</p>
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-1 italic">"{item.result.advice}"</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Planner History */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                  <h3 className="font-bold text-slate-800">Planner History</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {history.planner.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <Calendar className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No generated plans yet.</p>
                    </div>
                  ) : (
                    history.planner.map((item) => (
                      <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-emerald-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black text-emerald-600 uppercase">Daily Plan</span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                          {item.plan.slice(0, 5).map((p, i) => (
                            <span key={i} className="flex-shrink-0 px-2 py-1 bg-white border border-emerald-100 rounded text-[9px] font-bold text-emerald-700">
                              {p.time} {p.activity}
                            </span>
                          ))}
                          {item.plan.length > 5 && <span className="text-[9px] text-slate-400 flex items-center">+{item.plan.length - 5} more</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chat History */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-rose-500" />
                  <h3 className="font-bold text-slate-800">Chat History</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {history.chat.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <MessageSquare className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No chat history yet.</p>
                    </div>
                  ) : (
                    history.chat.map((item) => (
                      <div key={item.id} className="p-4 rounded-xl border border-slate-100 bg-rose-50/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black text-rose-600 uppercase">Therapist Session</span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-700 line-clamp-1">Q: {item.userMessage}</p>
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">A: {item.aiResponse}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Activity Log */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[500px]">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-slate-600" />
                  <h3 className="font-bold text-slate-800">Activity Log</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {history.activity_log.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4">
                      <Clock className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium">No activity logged yet.</p>
                    </div>
                  ) : (
                    <div className="relative space-y-6 before:absolute before:inset-0 before:ml-2 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-100">
                      {history.activity_log.map((item) => (
                        <div key={item.id} className="relative flex items-center justify-between gap-4 pl-8">
                          <div className="absolute left-0 w-4 h-4 rounded-full bg-white border-2 border-indigo-500" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-slate-700">{item.action}</p>
                            <p className="text-[10px] text-slate-400">{new Date(item.timestamp).toLocaleTimeString()}</p>
                          </div>
                          <div className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                            {new Date(item.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        ) : view === 'profile' ? (
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl mx-auto space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Your Profile</h2>
                <p className="text-slate-500 text-sm">Manage your personal information and cognitive goals.</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-8 space-y-6">
                <div className="flex flex-col items-center gap-4 pb-6 border-b border-slate-100">
                  <div className="relative group">
                    <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                      ) : user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-12 h-12 text-indigo-600" />
                      )}
                    </div>
                    <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-all">
                      <Camera className="w-4 h-4" />
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
                    </label>
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-800">{user.username}</h3>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">Cognitive Explorer</p>
                  </div>
                </div>

                <form className="space-y-6" onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleUpdateProfile({
                    username: formData.get('username') as string,
                    bio: formData.get('bio') as string,
                    goal: formData.get('goal') as string,
                  });
                }}>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Username</label>
                    <input 
                      name="username"
                      type="text" 
                      defaultValue={user.username}
                      required
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Bio</label>
                    <textarea 
                      name="bio"
                      defaultValue={user.bio}
                      placeholder="Tell us a bit about yourself..."
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-24 resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-wider">Cognitive Goal</label>
                    <input 
                      name="goal"
                      type="text" 
                      defaultValue={user.goal}
                      placeholder="e.g. Reduce stress, improve focus"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Save Changes
                  </button>
                </form>
              </div>
            </div>
          </motion.section>
        ) : view === 'planner' ? (
          <motion.section
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-800">Smart Daily Plan</h2>
                <p className="text-slate-500 text-sm">Generate a balanced schedule tailored to your cognitive state.</p>
              </div>
              <div className={`px-4 py-2 rounded-xl border font-bold text-sm flex items-center gap-2 ${getStressColor(result?.stressLevel || 'Unknown')}`}>
                <Activity className="w-4 h-4" />
                Stress: {result?.stressLevel || 'Not Analyzed'}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Planner Inputs */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <Layout className="w-5 h-5 text-indigo-600" />
                    Plan Parameters
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Wake-up</label>
                        <input 
                          type="time" 
                          value={plannerInputs.wakeUpTime}
                          onChange={(e) => setPlannerInputs({...plannerInputs, wakeUpTime: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Sleep</label>
                        <input 
                          type="time" 
                          value={plannerInputs.sleepTime}
                          onChange={(e) => setPlannerInputs({...plannerInputs, sleepTime: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Study Hours Required</label>
                      <input 
                        type="number" 
                        value={plannerInputs.studyHoursRequired}
                        onChange={(e) => setPlannerInputs({...plannerInputs, studyHoursRequired: Number(e.target.value)})}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        min="0" max="16"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Screen Time Limit (hrs)</label>
                      <input 
                        type="number" 
                        value={plannerInputs.screenTimeLimit}
                        onChange={(e) => setPlannerInputs({...plannerInputs, screenTimeLimit: Number(e.target.value)})}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        min="0" max="16"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Physical Activity (mins)</label>
                      <input 
                        type="number" 
                        value={plannerInputs.physicalActivityMinutes}
                        onChange={(e) => setPlannerInputs({...plannerInputs, physicalActivityMinutes: Number(e.target.value)})}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        min="0" max="180"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Custom Activities</label>
                      <textarea 
                        value={plannerInputs.customActivities}
                        onChange={(e) => setPlannerInputs({...plannerInputs, customActivities: e.target.value})}
                        placeholder="e.g. Gym, Reading, Class"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none"
                      />
                    </div>

                    <button 
                      onClick={handleGeneratePlan}
                      disabled={plannerLoading}
                      className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {plannerLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                      Generate Plan
                    </button>
                  </div>
                </div>
              </div>

              {/* Timetable Display */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-bold text-slate-800">Daily Schedule</h3>
                    </div>
                    {dailyPlan.length > 0 && (
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded">
                        Optimized for {result?.stressLevel || 'General'} Stress
                      </span>
                    )}
                  </div>
                  
                  <div className="p-6">
                    {dailyPlan.length === 0 ? (
                      <div className="h-[400px] flex flex-col items-center justify-center text-slate-300 space-y-4">
                        <Calendar className="w-16 h-16 opacity-10" />
                        <p className="text-sm font-medium">Set your parameters and generate a plan.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {dailyPlan.map((item, idx) => (
                          <div 
                            key={idx} 
                            className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                              item.type === 'study' ? 'bg-indigo-50 border-indigo-100' :
                              item.type === 'break' ? 'bg-emerald-50 border-emerald-100' :
                              item.type === 'sleep' ? 'bg-slate-50 border-slate-200 opacity-60' :
                              'bg-white border-slate-100'
                            }`}
                          >
                            <div className="w-24 text-sm font-black text-slate-400">
                              {item.time}
                            </div>
                            <div className="flex-1 flex items-center justify-between">
                              <span className={`font-bold ${
                                item.type === 'study' ? 'text-indigo-700' :
                                item.type === 'break' ? 'text-emerald-700' :
                                'text-slate-700'
                              }`}>
                                {item.activity}
                              </span>
                              <div className="flex items-center gap-2">
                                {item.type === 'study' && <BookOpen className="w-4 h-4 text-indigo-400" />}
                                {item.type === 'break' && <Coffee className="w-4 h-4 text-emerald-400" />}
                                {item.type === 'sleep' && <Moon className="w-4 h-4 text-slate-400" />}
                                {item.type === 'other' && <Check className="w-4 h-4 text-slate-300" />}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        ) : (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* Input Section */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-800">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  Behavioral Inputs
                </h2>
                <p className="text-sm text-slate-500 mt-1">Adjust your daily metrics for a real-time cognitive assessment.</p>
              </div>
              
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Sleep Hours */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <Moon className="w-4 h-4 text-indigo-500" /> Sleep Hours
                  </label>
                  <input 
                    type="number" 
                    value={inputs.sleepHours}
                    onChange={(e) => setInputs({...inputs, sleepHours: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="0" max="24"
                  />
                </div>

                {/* Sleep Quality */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <RefreshCw className="w-4 h-4 text-indigo-500" /> Sleep Quality
                  </label>
                  <select 
                    value={inputs.sleepQuality}
                    onChange={(e) => setInputs({...inputs, sleepQuality: e.target.value as SleepQuality})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  >
                    <option value="Poor">Poor</option>
                    <option value="Average">Average</option>
                    <option value="Good">Good</option>
                  </select>
                </div>

                {/* Study Hours */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <BookOpen className="w-4 h-4 text-indigo-500" /> Study Hours
                  </label>
                  <input 
                    type="number" 
                    value={inputs.studyHours}
                    onChange={(e) => setInputs({...inputs, studyHours: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="0" max="24"
                  />
                </div>

                {/* Mood */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <Smile className="w-4 h-4 text-indigo-500" /> Mood (1-5)
                  </label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" max="5" 
                      value={inputs.mood}
                      onChange={(e) => setInputs({...inputs, mood: Number(e.target.value)})}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <span className="text-lg font-bold text-indigo-600 w-4">{inputs.mood}</span>
                  </div>
                </div>

                {/* Screen Time */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <Monitor className="w-4 h-4 text-indigo-500" /> Screen Time (hrs)
                  </label>
                  <input 
                    type="number" 
                    value={inputs.screenTime}
                    onChange={(e) => setInputs({...inputs, screenTime: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="0" max="24"
                  />
                </div>

                {/* Physical Activity */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <Activity className="w-4 h-4 text-indigo-500" /> Physical Activity
                  </label>
                  <select 
                    value={inputs.physicalActivity}
                    onChange={(e) => setInputs({...inputs, physicalActivity: e.target.value as PhysicalActivity})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  >
                    <option value="None">None</option>
                    <option value="Light">Light</option>
                    <option value="Regular">Regular</option>
                  </select>
                </div>

                {/* Deadline Pressure */}
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2 text-slate-700">
                    <AlertTriangle className="w-4 h-4 text-indigo-500" /> Deadline Pressure
                  </label>
                  <select 
                    value={inputs.deadlinePressure}
                    onChange={(e) => setInputs({...inputs, deadlinePressure: e.target.value as DeadlinePressure})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-center">
                <button 
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Brain className="w-5 h-5" />}
                  Analyze Cognitive Stress
                </button>
              </div>
            </section>

            {/* Results Section */}
            <AnimatePresence mode="wait">
              {result && (
                <motion.section 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                >
                  {/* Main Metrics */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Current Assessment</span>
                          <h3 className="text-3xl font-black text-slate-800 mt-1">Analysis Results</h3>
                        </div>
                        <div className={`px-6 py-3 rounded-2xl border-2 font-black text-xl flex items-center gap-3 ${getStressColor(result.stressLevel)}`}>
                          {result.stressLevel === 'Critical' || result.stressLevel === 'High' ? <AlertCircle className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />}
                          {result.stressLevel} Stress
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-500">Cognitive Score</span>
                            <span className="text-2xl font-black text-indigo-600">{result.score}/100</span>
                          </div>
                          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${result.score}%` }}
                              className={`h-full ${result.score > 70 ? 'bg-emerald-500' : result.score > 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <span className="text-sm font-bold text-slate-500">Behavior Tag</span>
                          <div className="flex flex-wrap gap-2">
                            <span className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold border border-indigo-100">
                              {result.behaviorTag}
                            </span>
                          </div>
                          <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex gap-3">
                            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                            <div>
                              <span className="text-xs font-bold text-rose-600 uppercase block">Risk Alert</span>
                              <p className="text-sm text-rose-800 font-medium leading-tight mt-1">{result.riskAlert}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                          <Sun className="w-5 h-5 text-amber-500" />
                          Personalized Advice
                        </h4>
                      </div>
                      <p className="text-slate-600 leading-relaxed bg-slate-50 p-6 rounded-xl border border-slate-100 italic">
                        "{result.advice}"
                      </p>
                    </div>
                  </div>

                  {/* AI Explanation Sidebar */}
                  <div className="bg-indigo-900 text-white p-8 rounded-2xl shadow-xl shadow-indigo-200 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <Brain className="w-32 h-32" />
                    </div>
                    <div className="relative z-10 space-y-6">
                      <h4 className="text-xl font-bold flex items-center gap-2">
                        <Brain className="w-6 h-6" />
                        AI Reasoning
                      </h4>
                      <div className="space-y-4 text-indigo-100 text-sm leading-relaxed">
                        <p className="font-medium opacity-80">Based on your cognitive profile, the system has identified the following patterns:</p>
                        <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                          {result.aiExplanation}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.section>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Therapist Chat Assistant Section (Fixed Floating) */}
        <AnimatePresence>
          {showTherapist && (
            <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-8 pointer-events-none">
              <motion.section 
                initial={{ opacity: 0, y: 100, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 100, scale: 0.9 }}
                className="bg-white rounded-3xl shadow-2xl border border-rose-100 flex flex-col w-full max-w-md h-[600px] border-t-4 border-t-rose-400 pointer-events-auto"
              >
                <div className="p-6 border-b border-rose-50 bg-rose-50/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-rose-100 p-2 rounded-full">
                      <Heart className="w-6 h-6 text-rose-500" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-rose-900">AI Cognitive Therapist</h2>
                      <p className="text-xs text-rose-600 font-medium">Supportive • Professional</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowTherapist(false)}
                    className="p-2 hover:bg-rose-100 rounded-full transition-colors text-rose-400"
                  >
                    <ChevronRight className="w-6 h-6 rotate-90" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-rose-50/10">
                  {chatMessages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-rose-300 space-y-4">
                      <Heart className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-medium text-center max-w-xs">
                        "Hello {user.username}. I'm here to support you. How are you feeling about your current stress levels?"
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user' 
                          ? 'bg-rose-500 text-white rounded-tr-none shadow-lg shadow-rose-100' 
                          : 'bg-white text-slate-700 shadow-sm border border-rose-100 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-white p-4 rounded-2xl rounded-tl-none shadow-sm border border-rose-100">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-rose-300 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-rose-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                          <div className="w-2 h-2 bg-rose-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <form onSubmit={handleChatSend} className="p-6 bg-white border-t border-rose-50 flex gap-3">
                  <input 
                    type="text" 
                    value={currentChat}
                    onChange={(e) => setCurrentChat(e.target.value)}
                    placeholder="Share your thoughts..."
                    className="flex-1 px-5 py-3 rounded-2xl border border-rose-100 focus:ring-2 focus:ring-rose-400 focus:border-transparent outline-none transition-all bg-rose-50/20"
                  />
                  <button 
                    type="submit"
                    disabled={!currentChat.trim() || chatLoading}
                    className="p-3 bg-rose-500 text-white rounded-2xl hover:bg-rose-600 transition-all disabled:opacity-50 shadow-lg shadow-rose-100"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                </form>
              </motion.section>
            </div>
          )}
        </AnimatePresence>

        {/* Floating Toggle Button */}
        {!showTherapist && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            onClick={() => setShowTherapist(true)}
            className="fixed bottom-8 right-8 w-16 h-16 bg-rose-500 text-white rounded-full shadow-2xl shadow-rose-200 flex items-center justify-center hover:bg-rose-600 transition-all z-40 group"
          >
            <Heart className="w-8 h-8 group-hover:scale-110 transition-transform" />
            <div className="absolute right-full mr-4 px-4 py-2 bg-white text-rose-600 rounded-xl shadow-lg border border-rose-100 text-sm font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Talk to Therapist
            </div>
          </motion.button>
        )}
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-sm text-slate-400 font-medium">© 2026 Cognitive Stress Analyzer AI • Behavioral Science Division</p>
      </footer>
    </div>
  );
}
