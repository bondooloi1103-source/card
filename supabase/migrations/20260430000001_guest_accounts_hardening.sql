-- 20260430000001_guest_accounts_hardening.sql
-- Follow-up hardening for the guest-accounts feature shipped in
-- 20260430000000_guest_accounts.sql. All four CREATE OR REPLACE — no schema
-- changes, no data risk.

-- 1. revoke_auth_sessions: tighten search_path posture.
create or replace function public.revoke_auth_sessions(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.sessions where user_id = p_user_id;
$$;

-- 2. handle_new_auth_user: explicit search_path = public.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, is_admin, parent_user_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'is_admin')::boolean, false),
    nullif(new.raw_app_meta_data->>'parent_user_id', '')::uuid
  );
  return new;
end;
$$;

-- 3. guest_slots_cap_check: serialize concurrent inserts per parent.
create or replace function public.guest_slots_cap_check()
returns trigger
language plpgsql
as $$
declare v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('guest-slot:' || new.parent_user_id::text));

  select count(*) into v_count from public.guest_slots
   where parent_user_id = new.parent_user_id;
  if v_count >= 5 then
    raise exception 'parent already has 5 guest slots';
  end if;
  return new;
end $$;

-- 4. finalize_tournament: terminal call — early-out if already published.
create or replace function public.finalize_tournament(tid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if exists (select 1 from public.tournaments where id = tid and published) then
    return;
  end if;

  for r in
    select tournament_owner_id as winner_id, row_number() over (
      order by score desc, completed_at asc, tournament_owner_id
    ) as rn
    from public.game_results
    where tournament_id = tid
    order by score desc, completed_at asc, tournament_owner_id
    limit 3
  loop
    insert into public.user_achievements (user_id, kind, ref_id)
    values (
      r.winner_id,
      case r.rn when 1 then 'tournament_gold'
                when 2 then 'tournament_silver'
                else 'tournament_bronze' end,
      tid
    )
    on conflict (user_id, ref_id)
      where kind in ('tournament_gold','tournament_silver','tournament_bronze')
      do nothing;
  end loop;

  update public.tournaments set published = true where id = tid and not published;
end;
$$;
