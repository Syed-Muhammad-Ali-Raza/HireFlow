import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

export interface AIResponse {
  match_score: number;
  match_reasoning: string;
  matched_skills: string[];
  missing_skills: string[];
}

const SYSTEM_PROMPT = `You are an expert technical recruiter. Analyze the candidate's resume text against the provided job description.
Evaluate the candidate and return:
1. A match score (integer from 0 to 100) representing how well their profile matches the job requirements.
2. A match reasoning (2-3 sentences) summarizing their strengths and specific gaps relative to the job.
3. A list of matched skills (skills from the resume that match the job description).
4. A list of missing skills (skills required in the job description but not clearly present in the resume).

You must respond ONLY with a valid JSON object matching the following TypeScript interface:
{
  "match_score": number,
  "match_reasoning": string,
  "matched_skills": string[],
  "missing_skills": string[]
}
Do not include any introductory or concluding text, explanations, or code block markers (like \`\`\`json). Output raw, minified JSON only.`;

export async function evaluateResume(jdText: string, resumeText: string): Promise<AIResponse> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (anthropicKey) {
    return runClaude(anthropicKey, jdText, resumeText);
  } else if (geminiKey) {
    return runGemini(geminiKey, jdText, resumeText);
  } else {
    console.warn('AI matching running in SIMULATION mode. Set ANTHROPIC_API_KEY or GEMINI_API_KEY for real AI scoring.');
    return runSimulation(jdText, resumeText);
  }
}

async function runClaude(apiKey: string, jdText: string, resumeText: string): Promise<AIResponse> {
  const anthropic = new Anthropic({ apiKey });
  
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `JOB DESCRIPTION:\n${jdText}\n\nRESUME TEXT:\n${resumeText}`,
      },
    ],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseAIJSON(content);
}

async function runGemini(apiKey: string, jdText: string, resumeText: string): Promise<AIResponse> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    } as any,
  });

  const prompt = `${SYSTEM_PROMPT}\n\nJOB DESCRIPTION:\n${jdText}\n\nRESUME TEXT:\n${resumeText}`;
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const content = response.text();
  return parseAIJSON(content);
}

function parseAIJSON(text: string): AIResponse {
  try {
    // Strip markdown formatting if any
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();

    const parsed = JSON.parse(cleaned);
    return {
      match_score: typeof parsed.match_score === 'number' ? parsed.match_score : 50,
      match_reasoning: parsed.match_reasoning || 'No reasoning provided by AI.',
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills : [],
    };
  } catch (error) {
    console.error('Failed to parse AI JSON response:', text, error);
    return {
      match_score: 0,
      match_reasoning: 'Error occurred while parsing the AI response.',
      matched_skills: [],
      missing_skills: [],
    };
  }
}

// Fallback algorithm for local testing when no keys are available
function runSimulation(jdText: string, resumeText: string): AIResponse {
  const jdLower = jdText.toLowerCase();
  const resumeLower = resumeText.toLowerCase();

  // Simple key skill list to look for in JD
  const skillKeywords = [
    'react', 'next.js', 'nextjs', 'typescript', 'javascript', 'node.js', 'nodejs',
    'python', 'django', 'supabase', 'postgres', 'postgresql', 'sql', 'nosql', 'mongodb',
    'tailwind', 'css', 'html', 'graphql', 'rest', 'api', 'docker', 'aws', 'kubernetes',
    'git', 'github', 'agile', 'scrum', 'testing', 'jest', 'cypress'
  ];

  const matched: string[] = [];
  const missing: string[] = [];

  skillKeywords.forEach(skill => {
    const isRequired = jdLower.includes(skill);
    const hasSkill = resumeLower.includes(skill);

    if (isRequired) {
      if (hasSkill) {
        matched.push(skill.toUpperCase());
      } else {
        missing.push(skill.toUpperCase());
      }
    }
  });

  const totalRequired = matched.length + missing.length;
  const match_score = totalRequired > 0 
    ? Math.round((matched.length / totalRequired) * 100) 
    : 70; // default if no keywords found

  const match_reasoning = matched.length > 0
    ? `Candidate has key matches in ${matched.slice(0, 3).join(', ')}. Missing skills identified include ${missing.slice(0, 3).join(', ') || 'none'}.`
    : `Candidate's skills do not strongly overlap with job keywords. missing requirements like ${missing.slice(0, 3).join(', ')}.`;

  return {
    match_score,
    match_reasoning,
    matched_skills: matched,
    missing_skills: missing
  };
}
