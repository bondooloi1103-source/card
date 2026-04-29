import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const BUCKET = 'figure-videos';

function publicUrl(path) {
  if (!path) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

export function useFigureARTarget(figId) {
  const id = Number(figId);
  const enabled = Number.isInteger(id) && id > 0;

  const query = useQuery({
    queryKey: ['figure_ar_target', id],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figure_back_videos')
        .select('fig_id, video_path, ar_target_path')
        .eq('fig_id', id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const row = query.data;
  const videoUrl = publicUrl(row?.video_path);
  const targetUrl = publicUrl(row?.ar_target_path);
  const ready = !!(videoUrl && targetUrl);

  return {
    ready,
    videoUrl,
    targetUrl,
    loading: query.isLoading,
    error: query.error ?? null,
  };
}
