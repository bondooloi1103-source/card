import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = 'figure-videos';

function publicUrl(path) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

export function useFigureBackVideos() {
  return useQuery({
    queryKey: ['figure_back_videos'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('figure_back_videos')
        .select('fig_id, video_path, captions_path, ar_target_path, model_path, duration_s');
      if (error) throw error;
      const byId = {};
      for (const row of data ?? []) {
        byId[row.fig_id] = {
          url: publicUrl(row.video_path),
          captionsUrl: publicUrl(row.captions_path),
          arTargetUrl: publicUrl(row.ar_target_path),
          arTargetPath: row.ar_target_path,
          modelUrl: publicUrl(row.model_path),
          modelPath: row.model_path,
          durationS: row.duration_s,
        };
      }
      return byId;
    },
  });
}

export function mergeBackVideos(figures, byId) {
  if (!byId) return figures;
  return figures.map((f) => {
    const v = byId[f.fig_id];
    if (!v) return f;
    return {
      ...f,
      back_video_url: v.url,
      back_captions_url: v.captionsUrl,
      back_video_duration: v.durationS,
      ar_target_url: v.arTargetUrl,
      model_url: v.modelUrl,
    };
  });
}
