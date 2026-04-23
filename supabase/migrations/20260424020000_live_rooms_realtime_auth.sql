-- Realtime subscribe-side auth for live quote-game rooms.
-- Before this migration: anyone who knew the join_code could subscribe to
--   `game:session:<id>` and observe `{correct, ms}` flags for every player.
-- After: private channels gate SELECT on realtime.messages to users who are
--   actually participants of the session embedded in the topic.
-- Server-side broadcasts continue to work because service_role bypasses RLS.

create policy "Participants read live-room broadcasts"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and topic like 'game:session:%'
  and exists (
    select 1
    from public.game_participants gp
    where gp.user_id = auth.uid()
      and gp.session_id::text = substring(realtime.messages.topic from length('game:session:') + 1)
  )
);
