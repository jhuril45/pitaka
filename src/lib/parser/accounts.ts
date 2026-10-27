import { editDistance, normalizeMerchant, wordRegex } from './normalize';

export interface ParserAccount {
  uuid: string;
  name: string;
  type: string;
  templateKey: string | null;
  archived?: boolean;
}

/** Extra names people use, keyed by bank template key. */
const ALIASES: Record<string, string[]> = {
  gcash: ['gcash', 'g-cash', 'g cash'],
  maya: ['maya', 'paymaya'],
  shopeepay: ['shopeepay', 'spay'],
  gotyme: ['gotyme', 'go tyme'],
  seabank: ['seabank', 'sea bank'],
  tonik: ['tonik'],
  cimb: ['cimb'],
  bdo: ['bdo'],
  bpi: ['bpi'],
  metrobank: ['metrobank', 'metro bank'],
  landbank: ['landbank', 'land bank', 'lbp'],
  unionbank: ['unionbank', 'union bank'],
  securitybank: ['security bank', 'securitybank', 'secbank'],
  chinabank: ['chinabank', 'china bank'],
  rcbc: ['rcbc'],
  pnb: ['pnb'],
  eastwest: ['eastwest', 'east west'],
  cash: ['cash', 'pera', 'wallet', 'pitaka'],
  credit_card: ['credit card', 'creditcard', 'cc', 'card'],
};

const TYPE_WORDS: Record<string, string[]> = {
  credit_card: ['credit card', 'card', 'cc'],
  loan: ['loan', 'utang sa bangko'],
  cash: ['cash'],
};

export interface AccountMatch {
  account: ParserAccount;
  text: string;
  index: number;
}

function phrasesFor(account: ParserAccount): string[] {
  const out = new Set<string>();
  const name = account.name.trim().toLowerCase();
  if (name) out.add(name);
  for (const alias of ALIASES[account.templateKey ?? ''] ?? []) out.add(alias);
  for (const word of TYPE_WORDS[account.type] ?? []) out.add(word);
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Accounts mentioned in the phrase, in the order they appear. Matches whole
 * names and aliases ("gcash", "paymaya", "card"), then single-word names one
 * typo away ("gcsh" → GCash) for words of 4+ letters.
 */
export function findAccounts(text: string, accounts: ParserAccount[]): AccountMatch[] {
  const matches: AccountMatch[] = [];
  const taken: [number, number][] = [];
  const free = (start: number, end: number) => taken.every(([s, e]) => end <= s || start >= e);

  // Longest phrases first so "credit card" wins over "card".
  const phrases = accounts
    .filter((a) => !a.archived)
    .flatMap((account) => phrasesFor(account).map((phrase) => ({ account, phrase })))
    .sort((a, b) => b.phrase.length - a.phrase.length);

  for (const { account, phrase } of phrases) {
    const m = wordRegex(phrase).exec(text);
    if (!m || !free(m.index, m.index + m[0].length)) continue;
    if (matches.some((x) => x.account.uuid === account.uuid)) continue;
    taken.push([m.index, m.index + m[0].length]);
    matches.push({ account, text: m[0], index: m.index });
  }

  // One-typo tolerance for single-word account names.
  for (const word of text.matchAll(/[\p{L}]{4,}/gu)) {
    const start = word.index ?? 0;
    if (!free(start, start + word[0].length)) continue;
    const lower = word[0].toLowerCase();
    const hit = accounts.find(
      (a) =>
        !a.archived &&
        !matches.some((x) => x.account.uuid === a.uuid) &&
        phrasesFor(a).some((p) => !p.includes(' ') && p.length >= 4 && editDistance(p, lower, 1) === 1),
    );
    if (hit) {
      taken.push([start, start + word[0].length]);
      matches.push({ account: hit, text: word[0], index: start });
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

/** Pick a default account: the first everyday account (cash, e-wallet, bank). */
export function defaultAccount(accounts: ParserAccount[]): ParserAccount | null {
  const live = accounts.filter((a) => !a.archived);
  return (
    live.find((a) => a.type === 'cash') ??
    live.find((a) => a.type === 'ewallet' || a.type === 'bank') ??
    live[0] ??
    null
  );
}

export { normalizeMerchant };
