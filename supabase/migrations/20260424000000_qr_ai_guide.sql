-- QR AI guide: rate-limits table + voice-cache storage bucket.

create table rate_limits (
  ip_hash text not null,
  bucket_hour text not null,
  endpoint text not null,
  count int not null default 0,
  primary key (ip_hash, bucket_hour, endpoint)
);

alter table rate_limits enable row level security;
-- No policies: no client access. Edge functions use service role.

-- Voice cache bucket for ElevenLabs output.
insert into storage.buckets (id, name, public)
values ('voice-cache', 'voice-cache', true)
on conflict (id) do nothing;

create policy "voice-cache public read"
  on storage.objects for select
  using (bucket_id = 'voice-cache');
-- No insert/update/delete policies for voice-cache: only service role writes.
