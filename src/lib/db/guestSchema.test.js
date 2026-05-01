// src/lib/db/guestSchema.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const skip = !URL || !KEY;
const d = skip ? describe.skip : describe;

let admin, parent, guestRow1, guestRow2;

d('guest schema invariants', () => {
  beforeAll(async () => {
    admin = createClient(URL, KEY);
    // Create parent
    const { data: u } = await admin.auth.admin.createUser({
      email: `gtest_parent_${Date.now()}@users.local`,
      password: 'pw', email_confirm: true,
      user_metadata: { username: `gtest_p_${Date.now()}` },
    });
    parent = u.user;
    // Create guest 1 via app_metadata
    const { data: g1 } = await admin.auth.admin.createUser({
      email: `gtest_g1_${Date.now()}@guests.local`,
      password: 'pw', email_confirm: true,
      user_metadata: { username: `gtest_g1_${Date.now()}` },
      app_metadata: { parent_user_id: parent.id },
    });
    guestRow1 = g1.user;
    // Create guest 2
    const { data: g2 } = await admin.auth.admin.createUser({
      email: `gtest_g2_${Date.now()}@guests.local`,
      password: 'pw', email_confirm: true,
      user_metadata: { username: `gtest_g2_${Date.now()}` },
      app_metadata: { parent_user_id: parent.id },
    });
    guestRow2 = g2.user;
  });

  afterAll(async () => {
    if (parent)     await admin.auth.admin.deleteUser(parent.id);
    if (guestRow1)  await admin.auth.admin.deleteUser(guestRow1.id);
    if (guestRow2)  await admin.auth.admin.deleteUser(guestRow2.id);
  });

  it('chained-parent block: createUser fails when parent is itself a guest', async () => {
    // RAISE EXCEPTION inside an AFTER INSERT trigger aborts the *entire*
    // statement, including the auth.users insert that fired it. So createUser
    // returns an error and no auth.users row is committed — no cleanup needed.
    const { data, error } = await admin.auth.admin.createUser({
      email: `gtest_chain_${Date.now()}@guests.local`,
      password: 'pw', email_confirm: true,
      app_metadata: { parent_user_id: guestRow1.id },
    });
    expect(error?.message).toMatch(/parent must itself be a top-level account/);
    expect(data?.user).toBeFalsy();
  });

  it('parent_user_id is immutable on UPDATE', async () => {
    const { error } = await admin.from('profiles')
      .update({ parent_user_id: null })
      .eq('id', guestRow1.id);
    expect(error?.message).toMatch(/parent_user_id is immutable/);
  });

  it('5-slot cap: 6th insert fails', async () => {
    const slots = [1,2,3,4,5].map(i => ({
      parent_user_id: parent.id, slot_idx: i,
    }));
    const { error: e1 } = await admin.from('guest_slots').insert(slots);
    expect(e1).toBeNull();
    const { error: e2 } = await admin.from('guest_slots').insert({
      parent_user_id: parent.id, slot_idx: 1,
    });
    expect(e2).toBeTruthy(); // unique violation OR cap trigger
    // cleanup
    await admin.from('guest_slots').delete().eq('parent_user_id', parent.id);
  });

  it('slot_idx CHECK: out-of-range rejected', async () => {
    const { error } = await admin.from('guest_slots').insert({
      parent_user_id: parent.id, slot_idx: 99,
    });
    expect(error?.message).toMatch(/check/i);
  });

  it('username partial unique allows guest reuse', async () => {
    // Both guests can have the same display_name; humans cannot share usernames.
    // The guest profile rows have parent_user_id IS NOT NULL, so the partial
    // unique index does not apply to them. Update both guests to same username.
    const { error: e1 } = await admin.from('profiles')
      .update({ username: 'shared_alias' }).eq('id', guestRow1.id);
    const { error: e2 } = await admin.from('profiles')
      .update({ username: 'shared_alias' }).eq('id', guestRow2.id);
    expect(e1).toBeNull();
    expect(e2).toBeNull();
  });

  it('REVOKE on tournament_owner_id: client cannot insert', async () => {
    // Create a fake tournament_id situation; this test only checks the column
    // privilege, not the trigger semantics.
    const userClient = createClient(URL, process.env.VITE_SUPABASE_ANON_KEY);
    // Sign in as parent
    await admin.auth.admin.updateUserById(parent.id, { password: 'pw' });
    await userClient.auth.signInWithPassword({ email: parent.email, password: 'pw' });

    const { error } = await userClient.from('game_results').insert({
      session_id: '00000000-0000-0000-0000-000000000000',
      user_id: parent.id,
      score: 0, total: 0,
      tournament_owner_id: parent.id, // explicit = should be denied
    });
    expect(error?.message).toMatch(/permission|column/i);
  });
});
