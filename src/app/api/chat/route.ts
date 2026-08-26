import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { assertRole } from '@/lib/auth-helpers';
import { handleAgentChat } from '@/lib/chat-agent';

// Set route segment config to force dynamic
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat
 * - If threadId is provided: Fetch all messages for the thread.
 * - Otherwise: Fetch all active chat threads for the current user.
 */
export async function GET(request: Request) {
  try {
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter', 'interviewer']);
    if (errorResponse) return errorResponse;

    const supabase = await createClient();
    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId');

    if (threadId) {
      // Fetch thread detail to verify company scoping
      const { data: thread, error: threadErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .eq('company_id', profile.company_id)
        .single();

      if (threadErr || !thread) {
        return NextResponse.json({ error: 'Thread not found or access denied.' }, { status: 404 });
      }

      // Fetch all messages for the thread
      const { data: messages, error: msgErr } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (msgErr) {
        return NextResponse.json({ error: msgErr.message }, { status: 500 });
      }

      return NextResponse.json({ thread, messages });
    } else {
      // Fetch all chat threads for the user's company
      const { data: threads, error: threadsErr } = await supabase
        .from('chat_threads')
        .select('*, chat_messages(content, created_at)')
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (threadsErr) {
        return NextResponse.json({ error: threadsErr.message }, { status: 500 });
      }

      // Format threads to include last active message snippet
      const formattedThreads = (threads || []).map((thread: any) => {
        const sortedMsgs = (thread.chat_messages || []).sort(
          (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return {
          id: thread.id,
          context_type: thread.context_type,
          context_id: thread.context_id,
          created_at: thread.created_at,
          last_message: sortedMsgs[0]?.content || 'No messages yet.',
          last_active: sortedMsgs[0]?.created_at || thread.created_at,
        };
      });

      return NextResponse.json(formattedThreads);
    }
  } catch (error: any) {
    console.error('Chat GET error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/chat
 * - Accepts message, threadId (optional), and jobId (optional).
 * - Creates a thread if none is provided.
 * - Stores user query, runs LLM tool-calling agent, streams answer back using SSE, and writes final answer to database.
 */
export async function POST(request: Request) {
  try {
    const { profile, errorResponse } = await assertRole(['admin', 'recruiter', 'interviewer']);
    if (errorResponse) return errorResponse;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key is not configured on this server.' },
        { status: 500 }
      );
    }

    const supabase = await createClient();
    const body = await request.json();
    const { message, threadId, jobId } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty.' }, { status: 400 });
    }

    let thread: any = null;

    if (threadId) {
      // Retrieve existing thread
      const { data: existingThread, error: threadErr } = await supabase
        .from('chat_threads')
        .select('*')
        .eq('id', threadId)
        .eq('company_id', profile.company_id)
        .single();

      if (threadErr || !existingThread) {
        return NextResponse.json({ error: 'Thread not found or access denied.' }, { status: 404 });
      }
      thread = existingThread;
    } else {
      // Create new thread
      const { data: newThread, error: createErr } = await supabase
        .from('chat_threads')
        .insert({
          company_id: profile.company_id,
          user_id: profile.id,
          context_type: jobId ? 'job' : 'general',
          context_id: jobId || null,
        })
        .select()
        .single();

      if (createErr || !newThread) {
        console.error('Failed to create chat thread:', createErr);
        return NextResponse.json({ error: 'Failed to create chat thread.' }, { status: 500 });
      }
      thread = newThread;
    }

    // Save the user's new message to the database
    const { error: userMsgErr } = await supabase
      .from('chat_messages')
      .insert({
        thread_id: thread.id,
        role: 'user',
        content: message.trim(),
      });

    if (userMsgErr) {
      console.error('Failed to save user message:', userMsgErr);
      return NextResponse.json({ error: 'Failed to save user message.' }, { status: 500 });
    }

    // Retrieve past messages for conversation memory (limit to last 15 messages)
    const { data: pastMessages, error: historyErr } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .limit(15);

    if (historyErr) {
      console.error('Failed to fetch chat history:', historyErr);
      return NextResponse.json({ error: 'Failed to retrieve conversation history.' }, { status: 500 });
    }

    // Format chat history for Gemini API
    const geminiHistory = (pastMessages || []).map((msg: any) => ({
      role: msg.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: msg.content }],
    }));

    // Set up system instructions with context details
    const dateToday = new Date().toLocaleDateString();
    const systemInstructions = `You are HireFlow Copilot, an AI recruiter copilot and administrative assistant.
Today's date is ${dateToday}.

Guidelines:
- You help recruiters summarize candidate reviews, list open jobs, check interview details, and analyze applications.
- Be concise, helpful, professional, and clear. Use bullet points and basic formatting (bold text, bullet points) where appropriate.
- You have database tools available to query. Always use these tools to answer specific questions instead of guessing or simulating details.
- Avoid displaying raw database UUIDs (like candidate or job IDs) to the user; reference them by name or title instead.
- The user is currently browsing HireFlow. Under no circumstances should you leak data from another company. The tool results are automatically isolated to the user's company context: "${profile.company_id}".
- Keep your answers scoped strictly to the data returned by the tools. If a query returns no results, state that clearly rather than hallucinating.`;

    // Invoke Gemini Chat Agent and get SSE Stream
    const genStream = await handleAgentChat(
      apiKey,
      geminiHistory,
      profile.company_id!,
      supabase,
      systemInstructions
    );

    // Create ReadableStream for Server-Sent Events (SSE)
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        let completeText = '';
        try {
          for await (const chunk of genStream.stream) {
            const text = chunk.text();
            completeText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }

          // Save final assistant message to the database
          if (completeText.trim()) {
            await supabase
              .from('chat_messages')
              .insert({
                thread_id: thread.id,
                role: 'assistant',
                content: completeText,
              });
          }

          // Send done signal with thread ID (useful when a new thread was created)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, threadId: thread.id })}\n\n`)
          );
        } catch (err: any) {
          console.error('SSE streaming error:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream error.' })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Chat POST route error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
