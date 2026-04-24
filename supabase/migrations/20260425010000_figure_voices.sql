-- Phase B: per-figure, per-language voice ID mapping for ElevenLabs narration.
create table figure_voices (
  fig_id      int  not null,
  lang        text not null check (lang in ('mn','en','cn')),
  voice_id    text not null,
  sample_url  text,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (fig_id, lang)
);

alter table figure_voices enable row level security;

create policy "voices public read" on figure_voices for select using (true);
create policy "voices admin write" on figure_voices for all    using (is_admin());
