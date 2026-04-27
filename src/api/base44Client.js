// Supabase-backed replacement for the old localStorage stub. Keeps the same
// exported shape (`base44.auth`, `base44.entities`, `base44.integrations`) so
// consumers don't need to change.

import { supabase, emailToUsername } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Entity CRUD via Proxy. base44.entities.<Name> returns a CRUD wrapper.
// ---------------------------------------------------------------------------

const TABLE_MAP = {
  Figure: 'figures',
  Collection: 'collections',
  AppSettings: 'app_settings',
};

const tableName = (entityName) => TABLE_MAP[entityName] ?? entityName.toLowerCase();

const applyOrder = (query, sort) => {
  if (!sort) return query;
  const desc = sort.startsWith('-');
  const column = desc ? sort.slice(1) : sort;
  return query.order(column, { ascending: !desc });
};

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const makeEntity = (entityName) => {
  const table = tableName(entityName);
  return {
    list: async (sort, limit) => {
      let q = supabase.from(table).select('*');
      q = applyOrder(q, sort);
      if (limit) q = q.limit(limit);
      return unwrap(await q) ?? [];
    },
    filter: async (query, sort, limit) => {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(query ?? {})) q = q.eq(k, v);
      q = applyOrder(q, sort);
      if (limit) q = q.limit(limit);
      return unwrap(await q) ?? [];
    },
    get: async (id) => {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
    create: async (record) => {
      const { data, error } = await supabase.from(table).insert(record).select().single();
      if (error) throw error;
      return data;
    },
    update: async (id, patch) => {
      const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    },
    subscribe: (cb) => {
      const channel = supabase
        .channel(`realtime:${table}:${crypto.randomUUID()}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table },
            (payload) => {
              const typeMap = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };
              cb({
                type: typeMap[payload.eventType] ?? payload.eventType.toLowerCase(),
                id: payload.new?.id ?? payload.old?.id,
                data: payload.new ?? payload.old,
              });
            })
        .subscribe();
      return () => supabase.removeChannel(channel);
    },
  };
};

const entityHandler = {
  get(_t, prop) { return typeof prop === 'string' ? makeEntity(prop) : undefined; },
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const auth = {
  me: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).maybeSingle();
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.username ?? emailToUsername(user.email) ?? '',
      role: profile?.is_admin ? 'admin' : 'user',
    };
  },
  login: async () => { throw new Error('base44.auth.login is not used; see src/lib/authStore.js'); },
  logout: async () => { await supabase.auth.signOut(); },
  redirectToLogin: (returnTo) => {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    window.location.href = `/login${next}`;
  },
};

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const LLM_UNAVAILABLE_MSG = 'AI функц локал горимд идэвхгүй байна.';

const defaultFromSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return null;
  switch (schema.type) {
    case 'object': {
      const out = {};
      for (const k of Object.keys(schema.properties ?? {})) out[k] = defaultFromSchema(schema.properties[k]);
      return out;
    }
    case 'array': return [];
    case 'number': case 'integer': return 0;
    case 'boolean': return false;
    case 'string': default: return '';
  }
};

const fallbackResult = (response_json_schema) => {
  if (response_json_schema) {
    const base = defaultFromSchema(response_json_schema);
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      if ('answer' in base) base.answer = LLM_UNAVAILABLE_MSG;
      if ('overall' in base) base.overall = LLM_UNAVAILABLE_MSG;
    }
    return base;
  }
  return LLM_UNAVAILABLE_MSG;
};

const integrations = {
  Core: {
    InvokeLLM: async ({ prompt, response_json_schema } = {}) => {
      if (!prompt) return fallbackResult(response_json_schema);
      try {
        const { data, error } = await supabase.functions.invoke('invoke-llm', {
          body: { prompt, response_json_schema },
        });
        if (error || !data?.ok) {
          console.warn('invoke-llm failed', error || data);
          return fallbackResult(response_json_schema);
        }
        return data.reply ?? fallbackResult(response_json_schema);
      } catch (err) {
        console.warn('invoke-llm exception', err);
        return fallbackResult(response_json_schema);
      }
    },
    UploadFile: async ({ file }) => {
      if (!file) throw new Error('file required');
      const ext = file.name?.split('.').pop() ?? 'bin';
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('figure-images').upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('figure-images').getPublicUrl(path);
      return { file_url: data.publicUrl };
    },
  },
};

export const base44 = {
  auth,
  entities: new Proxy({}, entityHandler),
  integrations,
};
