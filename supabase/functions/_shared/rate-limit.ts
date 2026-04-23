import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export async function checkAndIncrement(
  admin: SupabaseClient,
  ipHashValue: string,
  bucketHour: string,
  endpoint: string,
  hourlyLimit: number,
): Promise<{ allowed: boolean; count: number }> {
  const { data: existing } = await admin
    .from('rate_limits')
    .select('count')
    .eq('ip_hash', ipHashValue)
    .eq('bucket_hour', bucketHour)
    .eq('endpoint', endpoint)
    .maybeSingle();

  const current = existing?.count ?? 0;
  if (current >= hourlyLimit) {
    return { allowed: false, count: current };
  }

  const nextCount = current + 1;
  const { error } = await admin
    .from('rate_limits')
    .upsert(
      { ip_hash: ipHashValue, bucket_hour: bucketHour, endpoint, count: nextCount },
      { onConflict: 'ip_hash,bucket_hour,endpoint' },
    );
  if (error) {
    // Fail open: if the DB write fails, don't block the user.
    console.error('rate-limit upsert failed', error);
  }
  return { allowed: true, count: nextCount };
}
