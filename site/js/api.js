// Accès aux données. Tout ce qui est affiché vient de Supabase (ou, en mode démo
// EXPLICITE via ?demo=1, de js/demo-data.js — jamais sans que ce soit signalé).
import { CONFIG } from './config.js';

// Valeurs affichées tant qu'un réglage est vide ou absent de la base (modifiables dans l'administration).
export const DEFAULT_SETTINGS = {
  site_name: 'À définir',
  hero_title: 'Des outils numériques simples, pour gérer votre activité.',
  hero_lead: "Retrouvez au même endroit des applications prêtes à l'emploi pour les indépendants, les entrepreneurs et les petites entreprises.",
  footer_text: 'Des outils numériques pensés pour les indépendants, les entrepreneurs et les petites entreprises.',
  show_categories: 'true',
  show_steps: 'true',
  whatsapp_number: '',
  contact_email: '',
  payment_instructions: '',
};

export class ApiError extends Error {
  constructor(kind, message, code) {
    super(message || kind);
    this.kind = kind;   // 'not_configured' | 'network' | 'server' | 'demo'
    this.code = code || '';
  }
}

let demoFlag = null;
export function isDemo() {
  if (demoFlag !== null) return demoFlag;
  const param = new URLSearchParams(location.search).get('demo');
  try {
    if (param === '1') sessionStorage.setItem('pf_demo', '1');
    if (param === '0') sessionStorage.removeItem('pf_demo');
    demoFlag = sessionStorage.getItem('pf_demo') === '1';
  } catch (_) {
    demoFlag = param === '1';
  }
  return demoFlag;
}

export function isConfigured() {
  return Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient);
}

let sb = null;
function client() {
  if (!isConfigured()) throw new ApiError('not_configured', 'Supabase non configuré');
  if (!sb) sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  return sb;
}

export const getClient = client;  // utilisé aussi par l'administration (même session)

async function run(query) {
  // supabase-js relance sinon les lectures plusieurs fois (≈14 s avant d'afficher une erreur) :
  // on préfère un message rapide avec un bouton « Réessayer » contrôlé par l'utilisateur.
  if (typeof query.retry === 'function') query = query.retry(false);
  const { data, error } = await query;
  if (error) throw new ApiError(error.code ? 'server' : 'network', error.message, error.code);
  return data;
}

const demoData = () => import('./demo-data.js');

const TOOL_COLUMNS =
  'id,slug,name,short_description,category_id,image_url,problems_solved,features,' +
  'price_amount,currency,access_duration_days,status,display_order';

const byOrder = (a, b) => (a.display_order - b.display_order) || a.name.localeCompare(b.name, 'fr');

export async function fetchSettings() {
  try {
    if (isDemo()) return { ...DEFAULT_SETTINGS };
    if (!isConfigured()) return { ...DEFAULT_SETTINGS };
    const rows = await run(client().from('site_settings').select('key,value'));
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows || []) if (r.key in out && typeof r.value === 'string' && r.value.trim()) out[r.key] = r.value.trim();
    return out;
  } catch (_) {
    return { ...DEFAULT_SETTINGS };  // les réglages ne doivent jamais bloquer l'affichage
  }
}

export async function fetchCatalogue() {
  if (isDemo()) { const d = await demoData(); return { categories: [...d.categories], tools: [...d.tools].sort(byOrder) }; }
  const c = client();
  const [categories, tools] = await Promise.all([
    run(c.from('categories').select('id,slug,name,description,display_order').order('display_order').order('name')),
    run(c.from('tools').select(TOOL_COLUMNS).order('display_order').order('name')),
  ]);
  return { categories: categories || [], tools: tools || [] };
}

// Retourne { tool, category, related } ; tool = null si le slug n'existe pas (ou est un brouillon).
export async function fetchTool(slug) {
  if (isDemo()) {
    const d = await demoData();
    const tool = d.tools.find((t) => t.slug === slug) || null;
    if (!tool) return { tool: null, category: null, related: [] };
    const category = d.categories.find((x) => x.id === tool.category_id) || null;
    const related = d.tools.filter((t) => t.category_id === tool.category_id && t.id !== tool.id).sort(byOrder).slice(0, 3);
    return { tool, category, related };
  }
  const c = client();
  const tool = await run(c.from('tools').select(TOOL_COLUMNS + ',long_description').eq('slug', slug).maybeSingle());
  if (!tool) return { tool: null, category: null, related: [] };
  let category = null, related = [];
  if (tool.category_id) {
    [category, related] = await Promise.all([
      run(c.from('categories').select('id,slug,name').eq('id', tool.category_id).maybeSingle()),
      run(c.from('tools').select(TOOL_COLUMNS).eq('category_id', tool.category_id).neq('id', tool.id).order('display_order').order('name').limit(3)),
    ]);
  }
  return { tool, category, related: related || [] };
}

// Le message est enregistré en base par la fonction submit_contact_message.
// Cette fonction ne retourne que si l'enregistrement a réussi.
export async function submitContact({ name, email, subject, message, hp }) {
  if (isDemo()) throw new ApiError('demo', 'Mode démonstration');
  const c = client();
  const { error } = await c.rpc('submit_contact_message', {
    p_name: name, p_email: email, p_subject: subject, p_message: message, p_hp: hp || '',
  });
  if (error) throw new ApiError(error.code ? 'server' : 'network', error.message, error.code);
}
