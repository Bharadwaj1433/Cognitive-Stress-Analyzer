import { GoogleGenAI, Type } from "@google/genai";
import { UserInputs, AnalysisResult, ChatMessage, PlannerInputs, DailyPlanItem, EmotionalAnalysis, WeeklyReport } from "../types";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export async function analyzeStress(inputs: UserInputs): Promise<AnalysisResult> {
  const prompt = `
    Analyze the following student behavior data and provide a cognitive stress analysis.
    
    Data:
    - Sleep: ${inputs.sleepHours} hours (${inputs.sleepQuality} quality)
    - Study: ${inputs.studyHours} hours
    - Mood: ${inputs.mood}/5
    - Screen Time: ${inputs.screenTime} hours/day
    - Physical Activity: ${inputs.physicalActivity}
    - Deadline Pressure: ${inputs.deadlinePressure}
    
    Logic Rules to consider:
    - Sleep < 5 OR poor sleep quality increases stress.
    - High study + high deadline pressure leads to very high stress.
    - High screen time increases cognitive fatigue.
    - Physical activity and good mood reduce stress.
    
    Return the result in the following JSON format:
    {
      "stressLevel": "Low" | "Moderate" | "High" | "Critical",
      "score": number (0-100, where 100 is best/lowest stress),
      "behaviorTag": "Short descriptive tag",
      "riskAlert": "Warning message if applicable",
      "advice": "Personalized actionable advice",
      "aiExplanation": "Detailed reasoning for this analysis"
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          stressLevel: { type: Type.STRING },
          score: { type: Type.NUMBER },
          behaviorTag: { type: Type.STRING },
          riskAlert: { type: Type.STRING },
          advice: { type: Type.STRING },
          aiExplanation: { type: Type.STRING },
        },
        required: ["stressLevel", "score", "behaviorTag", "riskAlert", "advice", "aiExplanation"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as AnalysisResult;
}

export async function getTherapistResponse(history: ChatMessage[], message: string, context: AnalysisResult | null) {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are a professional AI Cognitive Therapist. 
      Behavior Rules:
      - Speak with deep empathy, warmth, and a calm, supportive tone.
      - Use empathetic phrases like "I can hear how heavy that feels," "It makes complete sense that you're feeling this way," or "Thank you for sharing that with me."
      - Prioritize acknowledging the user's feelings explicitly and deeply before moving to analysis or suggestions.
      - Do NOT give robotic, clinical, or overly brief acknowledgments.
      
      Response Structure (STRICT ADHERENCE):
      1. Deep Empathetic Acknowledgment: Spend the first 1-2 sentences purely validating the user's emotional state.
      2. Gentle Insight: Briefly identify a possible cognitive or behavioral cause based on their data.
      3. Small, Supportive Step: Offer one gentle, low-pressure suggestion.
      
      Keep responses warm, human-like, and around 3-5 lines. Avoid technical jargon.
      
      Current Analysis Context:
      - Stress Level: ${context?.stressLevel || 'Unknown'}
      - Behavior Tag: ${context?.behaviorTag || 'Unknown'}
      - Advice given: ${context?.advice || 'None'}`,
    },
  });

  const result = await chat.sendMessage({ message });
  return result.text;
}

export async function generateDailyPlan(inputs: PlannerInputs, stressLevel: string): Promise<DailyPlanItem[]> {
  const prompt = `
    Generate a structured daily timetable based on the following user inputs and their current cognitive condition.
    
    User Inputs:
    - Wake-up Time: ${inputs.wakeUpTime}
    - Target Sleep Time: ${inputs.sleepTime}
    - Study Hours Required: ${inputs.studyHoursRequired}
    - Screen Time Limit: ${inputs.screenTimeLimit} hours
    - Physical Activity: ${inputs.physicalActivityMinutes} minutes
    - Custom Activities: ${inputs.customActivities}
    
    Current Cognitive Condition:
    - Stress Level: ${stressLevel}
    
    Priority Logic:
    - High/Critical Stress: Include more frequent breaks (every 45-60 mins), longer rest periods, and prioritize relaxation.
    - Low/Moderate Stress: Allow longer focus sessions (90-120 mins) with standard breaks.
    - Ensure sleep is properly scheduled.
    - Distribute study time evenly.
    - Include breaks, meals, and relaxation.
    - Avoid overloading with too many tasks.
    
    Return the result as a JSON array of objects with the following structure:
    [
      {
        "time": "6:00 AM",
        "activity": "Wake up",
        "type": "other" | "study" | "break" | "sleep"
      },
      ...
    ]
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            time: { type: Type.STRING },
            activity: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["study", "break", "sleep", "other"] },
          },
          required: ["time", "activity", "type"],
        },
      },
    },
  });

  return JSON.parse(response.text || "[]") as DailyPlanItem[];
}

export async function analyzeEmotion(text: string): Promise<EmotionalAnalysis> {
  const prompt = `
    You are an emotional analysis system.
    
    User Input:
    ${text}
    
    Task:
    Analyze emotional condition from the text.
    
    Instructions:
    - Detect emotion
    - Identify possible cause
    - Suggest one improvement
    
    Return the result in the following JSON format:
    {
      "emotion": "Detected emotion",
      "reason": "Possible cause",
      "suggestion": "One improvement"
    }
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          emotion: { type: Type.STRING },
          reason: { type: Type.STRING },
          suggestion: { type: Type.STRING },
        },
        required: ["emotion", "reason", "suggestion"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as EmotionalAnalysis;
}

export async function generateWeeklyReport(historyData: string, weeklyData: string, userText: string): Promise<WeeklyReport> {
  try {
    const prompt = `
      Analyze the following cognitive and behavioral data from the past week.
      
      History Data Summary:
      ${historyData}
      
      Weekly Metrics:
      ${weeklyData}
      
      User's Personal Notes/Context:
      ${userText}
      
      Task:
      Provide a comprehensive weekly cognitive report.
      
      Return the result in the following JSON format:
      {
        "summary": "A 2-3 sentence overview of the week",
        "stressTrend": "Improving" | "Stable" | "Declining",
        "keyInsights": ["Insight 1", "Insight 2", "Insight 3"],
        "recommendations": ["Recommendation 1", "Recommendation 2"]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            stressTrend: { type: Type.STRING },
            keyInsights: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["summary", "stressTrend", "keyInsights", "recommendations"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    const report = JSON.parse(text) as WeeklyReport;
    
    // Normalize stressTrend to match the enum if it's slightly off
    const trend = report.stressTrend.toLowerCase();
    if (trend.includes('improv')) report.stressTrend = 'Improving';
    else if (trend.includes('declin')) report.stressTrend = 'Declining';
    else report.stressTrend = 'Stable';

    return report;
  } catch (error) {
    console.error("Gemini Weekly Report Error:", error);
    throw error;
  }
}
