-- HireFlow Database Migration — Phase 4 (Recruiter Chatbot Assistant / Copilot)
-- Run this in the Supabase SQL Editor AFTER Phase 3 SQL
-- Guide: docs/SUPABASE_SETUP.md

-- 1. Create Chat Threads Table
create table if not exists public.chat_threads (
    id uuid primary key default uuid_generate_v4(),
    company_id uuid references public.companies(id) on delete cascade not null,
    user_id uuid references public.profiles(id) on delete cascade not null,
    context_type text check (context_type in ('general', 'job', 'candidate')),
    context_id uuid,
    created_at timestamp with time zone default now() not null
);

-- 2. Create Chat Messages Table
create table if not exists public.chat_messages (
    id uuid primary key default uuid_generate_v4(),
    thread_id uuid references public.chat_threads(id) on delete cascade not null,
    role text check (role in ('user', 'assistant', 'system')) not null,
    content text not null,
    created_at timestamp with time zone default now() not null
);

-- 3. Create Indexes for Performance
create index if not exists idx_chat_threads_company_id on public.chat_threads(company_id);
create index if not exists idx_chat_threads_user_id on public.chat_threads(user_id);
create index if not exists idx_chat_messages_thread_id on public.chat_messages(thread_id);

-- 4. Enable Row Level Security (RLS)
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- 5. RLS Policies for Chat Threads
drop policy if exists "Allow company members to view their company's chat threads" on public.chat_threads;
create policy "Allow company members to view their company's chat threads"
    on public.chat_threads for select
    using (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.company_id = chat_threads.company_id
        )
    );

drop policy if exists "Allow company members to insert chat threads for their company" on public.chat_threads;
create policy "Allow company members to insert chat threads for their company"
    on public.chat_threads for insert
    with check (
        exists (
            select 1 from public.profiles
            where profiles.id = auth.uid() and profiles.company_id = chat_threads.company_id
        )
    );

drop policy if exists "Allow company members to delete their own chat threads" on public.chat_threads;
create policy "Allow company members to delete their own chat threads"
    on public.chat_threads for delete
    using (
        user_id = auth.uid()
    );

-- 6. RLS Policies for Chat Messages
drop policy if exists "Allow company members to view messages in their company's threads" on public.chat_messages;
create policy "Allow company members to view messages in their company's threads"
    on public.chat_messages for select
    using (
        exists (
            select 1 from public.chat_threads
            join public.profiles on profiles.company_id = chat_threads.company_id
            where chat_threads.id = chat_messages.thread_id and profiles.id = auth.uid()
        )
    );

drop policy if exists "Allow company members to insert messages in their company's threads" on public.chat_messages;
create policy "Allow company members to insert messages in their company's threads"
    on public.chat_messages for insert
    with check (
        exists (
            select 1 from public.chat_threads
            join public.profiles on profiles.company_id = chat_threads.company_id
            where chat_threads.id = chat_messages.thread_id and profiles.id = auth.uid()
        )
    );
