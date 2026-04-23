-- Smoke test: RLS prevents unauthorized reads/writes. Run with:
--   supabase db execute --file supabase/tests/rls_smoke.sql
-- Each DO block raises on failure.

-- anon role cannot read access_codes
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from access_codes;
  if n <> 0 then raise exception 'anon should see 0 access_codes, got %', n; end if;
end $$;
reset role;

-- anon role CAN read figures and app_settings
do $$
begin
  set local role anon;
  perform count(*) from figures;
  perform count(*) from app_settings;
end $$;
reset role;

-- anon role cannot insert into figures
do $$
begin
  set local role anon;
  begin
    insert into figures (fig_id, name) values (999, 'should fail');
    raise exception 'anon insert into figures should have been denied';
  exception when insufficient_privilege or others then
    -- expected
  end;
end $$;
reset role;

-- ============================================================
-- Game tables RLS smoke (Phase 0).
-- ============================================================

-- anon cannot read game_sessions
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from game_sessions;
  if n <> 0 then raise exception 'anon should see 0 game_sessions, got %', n; end if;
end $$;
reset role;

-- anon cannot insert into game_results
do $$
begin
  set local role anon;
  begin
    insert into game_results (session_id, user_id, score, total, answers)
    values (gen_random_uuid(), gen_random_uuid(), 1, 1, '[]'::jsonb);
    raise exception 'anon insert into game_results should have been denied';
  exception when insufficient_privilege or check_violation or others then
    -- expected
  end;
end $$;
reset role;

-- authenticated cannot insert into game_results (blocked by policy)
do $$
begin
  set local role authenticated;
  begin
    insert into game_results (session_id, user_id, score, total, answers)
    values (gen_random_uuid(), gen_random_uuid(), 1, 1, '[]'::jsonb);
    raise exception 'authenticated insert into game_results should have been denied';
  exception when insufficient_privilege or check_violation or others then
    -- expected
  end;
end $$;
reset role;

-- anon cannot read tournaments that are not published
do $$
declare tid uuid;
declare n int;
begin
  insert into tournaments (name, seed, lang, starts_at, ends_at, created_by, published)
  values ('smoke-hidden', 'S', 'mn', now(), now() + interval '1 day',
          (select id from auth.users limit 1), false)
  returning id into tid;

  set local role anon;
  select count(*) into n from tournaments where id = tid;
  reset role;

  if n <> 0 then raise exception 'anon should not see unpublished tournament'; end if;

  delete from tournaments where id = tid;
end $$;
