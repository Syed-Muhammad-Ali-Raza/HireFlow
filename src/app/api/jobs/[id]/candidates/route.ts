import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { extractTextFromPdf } from '@/lib/pdf';
import { evaluateResume } from '@/lib/ai';
import { extractContactFromResume } from '@/lib/resume-parse';
import { assertRole } from '@/lib/auth-helpers';

// GET: List all candidates for a specific job posting, sorted by score descending
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const supabase = await createClient();

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch candidates for this job (RLS will check permission automatically)
    const { data: candidates, error: fetchError } = await supabase
      .from('candidates')
      .select('*')
      .eq('job_id', jobId)
      .order('match_score', { ascending: false });

    if (fetchError) {
      console.error('Fetch candidates error:', fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    return NextResponse.json(candidates);
  } catch (error: any) {
    console.error('Candidates GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// POST: Upload and rank a resume PDF for a job posting
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();

    // 2. Fetch Job Description
    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .select('*')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job posting not found' }, { status: 404 });
    }

    // 3. Read Multipart Form Data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const nameInput = formData.get('name') as string | null;
    const emailInput = formData.get('email') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'Resume PDF file is required' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Extract text from PDF
    let resumeText = '';
    try {
      resumeText = await extractTextFromPdf(buffer);
    } catch (parseError: any) {
      return NextResponse.json({ error: `PDF Parsing failed: ${parseError.message}` }, { status: 422 });
    }

    if (!resumeText.trim()) {
      return NextResponse.json({ error: 'Extracted resume text is empty' }, { status: 422 });
    }

    // 5. Upload File to Supabase Storage (optional / fallback if bucket does not exist)
    let fileUrl = '';
    const bucketName = 'resumes';
    const cleanFileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const storagePath = `${jobId}/${cleanFileName}`;

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(storagePath, buffer, {
          contentType: file.type || 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.warn('Storage upload error (continuing without storage):', uploadError.message);
        fileUrl = `/uploads/${storagePath}`; // fallback mock URL
      } else {
        const { data } = supabase.storage.from(bucketName).getPublicUrl(storagePath);
        fileUrl = data?.publicUrl || '';
      }
    } catch (storageErr) {
      console.warn('Failed to upload file to storage, continuing in fallback mode:', storageErr);
      fileUrl = `/uploads/${storagePath}`;
    }

    // 6. Run AI Ranking (Claude / Gemini)
    let aiEvaluation;
    try {
      aiEvaluation = await evaluateResume(job.description, resumeText);
    } catch (aiErr: any) {
      console.error('AI ranking error:', aiErr);
      return NextResponse.json({ error: `AI ranking failed: ${aiErr.message}` }, { status: 502 });
    }

    // Prefer form inputs → resume text extraction → filename stem
    const extracted = extractContactFromResume(resumeText);
    const filenameStem = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();
    const candidateName = nameInput?.trim() || extracted.name || filenameStem || 'Unknown Candidate';
    const candidateEmail = emailInput?.trim() || extracted.email || '';

    // 7. Save candidate records in DB
    const { data: candidate, error: saveError } = await supabase
      .from('candidates')
      .insert({
        job_id: jobId,
        name: candidateName,
        email: candidateEmail,
        resume_file_url: fileUrl,
        resume_text: resumeText,
        match_score: aiEvaluation.match_score,
        match_reasoning: aiEvaluation.match_reasoning,
        matched_skills: aiEvaluation.matched_skills,
        missing_skills: aiEvaluation.missing_skills,
        status: 'new',
      })
      .select()
      .single();

    if (saveError) {
      console.error('Database save error:', saveError);
      return NextResponse.json({ error: saveError.message }, { status: 500 });
    }

    return NextResponse.json(candidate, { status: 201 });
  } catch (error: any) {
    console.error('Candidate routing error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
