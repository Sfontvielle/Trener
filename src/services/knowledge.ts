import type { KnowledgeSource } from '@/types';

/**
 * Свежие научные обзоры из PubMed (NCBI E-utilities, публичный API без ключа).
 * Берутся только систематические обзоры, метаанализы и руководства — не случайные статьи.
 * Тренер работает и без сети: поиск лишь дополняет проверенные первоисточники базы знаний.
 */
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const FILTER = '(systematic review[pt] OR meta-analysis[pt] OR guideline[pt] OR practice guideline[pt] OR consensus development conference[pt])';

async function getJson<T>(url: string, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function searchReviews(query: string, max = 3): Promise<KnowledgeSource[]> {
  const term = encodeURIComponent(`(${query}) AND ${FILTER} AND ("last 10 years"[dp])`);
  const s = await getJson<{ esearchresult?: { idlist?: string[] } }>(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${max}&term=${term}`, 7000);
  const ids = s.esearchresult?.idlist ?? [];
  if (!ids.length) return [];
  const sum = await getJson<{ result?: Record<string, { title?: string; fulljournalname?: string; source?: string; pubdate?: string }> }>(`${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`, 7000);
  return ids
    .map((id) => {
      const r = sum.result?.[id];
      if (!r?.title) return null;
      return { title: r.title.replace(/\.$/, ''), org: r.source || r.fulljournalname || 'PubMed', url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, year: r.pubdate?.slice(0, 4) } as KnowledgeSource;
    })
    .filter((x): x is KnowledgeSource => !!x);
}
