import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Tool / Function Declarations for Gemini
const toolDeclarations: any[] = [
  {
    name: 'list_all_jobs',
    description: 'List all active job postings for the current company, including titles, required skills, and creation dates. Use this when the user asks what jobs are open or lists the current job vacancies.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    }
  },
  {
    name: 'get_job_details',
    description: 'Get job posting title, description, and required skills for a given job ID. Use this when the user asks about job requirements, qualifications, description, or role overview.',
    parameters: {
      type: 'OBJECT',
      properties: {
        job_id: { type: 'STRING', description: 'The job UUID' }
      },
      required: ['job_id']
    }
  },
  {
    name: 'list_job_candidates',
    description: 'Get the list of candidates who applied for a job, including their names, email, status (new, shortlisted, interview_scheduled, offer, rejected), match score, and created date. Use this when the user asks for a candidate list, who applied, candidate scores, or top candidates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        job_id: { type: 'STRING', description: 'The job UUID' }
      },
      required: ['job_id']
    }
  },
  {
    name: 'get_candidate_evaluation',
    description: 'Get the internal comments/notes and scorecard ratings/evaluations submitted by interviewers/recruiters for a specific candidate. Use this when the user asks about a candidate\'s feedback, scorecards, interviewer notes, or review comments.',
    parameters: {
      type: 'OBJECT',
      properties: {
        candidate_id: { type: 'STRING', description: 'The candidate UUID' }
      },
      required: ['candidate_id']
    }
  },
  {
    name: 'list_interviews',
    description: 'Get the scheduled interviews/events for a job, including candidate names, interview times, assigned interviewer details, meeting links, and status. Use this when the user asks about interview schedules, who is interviewing, calendar bookings, or calendar status.',
    parameters: {
      type: 'OBJECT',
      properties: {
        job_id: { type: 'STRING', description: 'The job UUID' }
      },
      required: ['job_id']
    }
  }
];

// 2. Tool Execution Logic
async function executeListAllJobs(companyId: string, supabase: any) {
  const { data, error } = await supabase
    .from('job_postings')
    .select('id, title, required_skills, created_at')
    .eq('company_id', companyId);
  if (error) throw error;
  return data;
}

async function executeGetJobDetails(jobId: string, companyId: string, supabase: any) {
  const { data, error } = await supabase
    .from('job_postings')
    .select('id, title, description, required_skills, created_at')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();
  if (error) throw error;
  return data;
}

async function executeListJobCandidates(jobId: string, companyId: string, supabase: any) {
  const { data: job, error: jobErr } = await supabase
    .from('job_postings')
    .select('id')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();
  if (jobErr || !job) throw new Error('Job not found or access denied.');

  const { data, error } = await supabase
    .from('candidates')
    .select('id, name, email, match_score, status, created_at')
    .eq('job_id', jobId)
    .order('match_score', { ascending: false });
  if (error) throw error;
  return data;
}

async function executeGetCandidateEvaluation(candidateId: string, companyId: string, supabase: any) {
  const { data: candidate, error: candErr } = await supabase
    .from('candidates')
    .select('id, name, job_postings(company_id)')
    .eq('id', candidateId)
    .single();
  if (candErr || !candidate || (candidate.job_postings as any).company_id !== companyId) {
    throw new Error('Candidate not found or access denied.');
  }

  const [notesRes, scorecardsRes] = await Promise.all([
    supabase
      .from('candidate_notes')
      .select('id, content, created_at, profiles(name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true }),
    supabase
      .from('candidate_scorecards')
      .select('id, overall_rating, feedback, created_at, profiles(name, email)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: true })
  ]);

  if (notesRes.error) throw notesRes.error;
  if (scorecardsRes.error) throw scorecardsRes.error;

  return {
    candidate_id: candidateId,
    candidate_name: candidate.name,
    comments: notesRes.data,
    scorecards: scorecardsRes.data
  };
}

async function executeListInterviews(jobId: string, companyId: string, supabase: any) {
  const { data: job, error: jobErr } = await supabase
    .from('job_postings')
    .select('id')
    .eq('id', jobId)
    .eq('company_id', companyId)
    .single();
  if (jobErr || !job) throw new Error('Job not found or access denied.');

  const { data, error } = await supabase
    .from('interviews')
    .select('id, scheduled_time, meeting_link, status, candidates!inner(name, job_id)')
    .eq('candidates.job_id', jobId)
    .order('scheduled_time', { ascending: true });

  if (error) throw error;
  return data.map((inv: any) => ({
    id: inv.id,
    scheduled_time: inv.scheduled_time,
    meeting_link: inv.meeting_link,
    status: inv.status,
    candidate_name: inv.candidates?.name
  }));
}

// 3. Core Chat Agent Loop
export async function handleAgentChat(
  apiKey: string,
  messages: Array<{ role: 'user' | 'model' | 'function'; parts: any[] }>,
  companyId: string,
  supabase: any,
  systemInstructions: string
) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: [{ functionDeclarations: toolDeclarations }] as any
  });

  // Prepend system instructions as conversation turns to support all SDK versions
  const contents = [
    { role: 'user' as const, parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemInstructions}` }] },
    { role: 'model' as const, parts: [{ text: 'Understood. I will act as HireFlow Copilot and follow all system instructions, constraints, and data rules.' }] },
    ...messages
  ];

  let loopCount = 0;
  const maxLoops = 5;

  while (loopCount < maxLoops) {
    loopCount++;
    
    // Call Gemini to get next turn
    const result = await model.generateContent({ contents });
    const response = result.response;
    const candidates = response.candidates;
    
    if (!candidates || candidates.length === 0) {
      throw new Error('No candidates returned from Gemini API.');
    }

    const firstCandidate = candidates[0];
    const parts = firstCandidate.content?.parts || [];
    
    // Check if the model called a function
    const functionCalls = parts.filter((part: any) => part.functionCall);

    if (functionCalls.length > 0) {
      // 1. Add model's functionCall turn to history
      contents.push({
        role: 'model',
        parts: functionCalls
      });

      // 2. Execute each function call and collect responses
      const functionResponseParts = [];
      for (const callObj of functionCalls) {
        const call = callObj.functionCall;
        if (!call) continue;
        const { name, args } = call as any;
        let data: any;

        try {
          if (name === 'list_all_jobs') {
            data = await executeListAllJobs(companyId, supabase);
          } else if (name === 'get_job_details') {
            data = await executeGetJobDetails(args.job_id, companyId, supabase);
          } else if (name === 'list_job_candidates') {
            data = await executeListJobCandidates(args.job_id, companyId, supabase);
          } else if (name === 'get_candidate_evaluation') {
            data = await executeGetCandidateEvaluation(args.candidate_id, companyId, supabase);
          } else if (name === 'list_interviews') {
            data = await executeListInterviews(args.job_id, companyId, supabase);
          } else {
            data = { error: `Tool ${name} not found.` };
          }
        } catch (err: any) {
          console.error(`Error executing tool ${name}:`, err);
          data = { error: err.message || 'Execution error.' };
        }

        functionResponseParts.push({
          functionResponse: {
            name,
            response: { content: data }
          }
        });
      }

      // 3. Add function responses as a user-like function role turn
      contents.push({
        role: 'function' as any,
        parts: functionResponseParts
      });

      // Loop back to Gemini with the function results
      continue;
    }

    // No function calls — we can return the contents representing the final model answer (or stream it)
    break;
  }

  // Once all function calls are resolved, we stream the final answer
  // We call model.generateContentStream to get a clean stream of text based on complete function call history
  return model.generateContentStream({ contents });
}
