-- Optional: HireFlow resumes Storage bucket
-- Run in Supabase SQL Editor after creating a bucket named "resumes"
-- (Dashboard → Storage → New bucket → name: resumes → Public: ON for simple demos,
--  or Public: OFF and use signed URLs later)

insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload into resumes/
create policy "Company members can upload resumes"
on storage.objects for insert
to authenticated
with check (bucket_id = 'resumes');

create policy "Company members can update resumes"
on storage.objects for update
to authenticated
using (bucket_id = 'resumes');

create policy "Public read resumes"
on storage.objects for select
to public
using (bucket_id = 'resumes');
