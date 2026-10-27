import { findAccounts, defaultAccount, type ParserAccount } from './accounts';
import { findAmount } from './amount';
import { resolveCategory, type CategorySource, type DictionaryEntry, type MerchantMappingLike, type ParserCategory } from './categories';
import { findDate } from './dates';
import { normalizeMerchant, wordRegex } from './normalize';

export { normalizeMerchant } from './normalize';
export type { ParserAccount } from './accounts';
export type { ParserCategory, MerchantMappingLike, DictionaryEntry, CategorySource } from './categories';

/**
 * Smart text entry: "Starbucks 250", "Salary 30k", "Paid credit card 5k last
 * week", "Grab 180 yesterday gcash", "Received 2000 from Mark". Runs fully on
 * the device. The result is a draft for the user to confirm, never saved as-is.
 */

export interface ParserDebt {
  uuid: string;
  counterparty: string;
  direction: 'i_owe' | 'owed_to_me';
  settled: boolean;
}

export interface ParseContext {
  accounts: ParserAccount[];
  categories: ParserCategory[];
  mappings?: MerchantMappingLike[];
  dictionary?: DictionaryEntry[];
  debts?: ParserDebt[];
  /** Currency used when the text names none (the default account's). */
  currency?: string;
  now?: Date;
}

export interface ParsedEntry {
  type: 'expense' | 'income' | 'transfer';
  amountMinor: number | null;
  /** Set when the text named a currency ("$20"). */
  currency?: string;
  occurredAt: Date;
  /** The recognised date phrase, e.g. "yesterday" (for the preview). */
  dateText?: string;
  merchant: string;
  accountUuid: string | null;
  toAccountUuid: string | null;
  categoryUuid: string | null;
  categorySource: CategorySource | null;
  /** "from Mark" in "Received 2000 from Mark". */
  counterparty?: string;
  /** Ask the user: plain income, or repayment of a debt owed to them? */
  confirm?: 'income-or-debt';
  /** Open debts owed to the user by `counterparty`. */
  debtMatches: ParserDebt[];
}

const TRANSFER_WORDS = ['transfer', 'transferred', 'move', 'moved', 'lipat', 'nilipat', 'top up', 'topup', 'cash in', 'cash out', 'withdraw', 'withdrew', 'deposit', 'deposited'];
const PAY_WORDS = ['paid', 'pay', 'payment', 'bayad', 'nagbayad', 'binayaran'];
const INCOME_WORDS = [
  'received', 'receive', 'got paid', 'natanggap', 'nakuha', 'income', 'kita', 'bonus', 'refund', 'refunded',
  'cashback', 'sold', 'nabenta', 'commission', 'dividend', 'interest',
];
const RECEIVE_WORDS = ['received', 'receive', 'natanggap', 'got'];
/** Words that carry no merchant information. */
const FILLER = [
  'at', 'sa', 'for', 'para', 'paid', 'pay', 'payment', 'bayad', 'nagbayad', 'binayaran', 'bought', 'buy', 'bili', 'binili',
  'spent', 'spend', 'gastos', 'via', 'using', 'gamit', 'with', 'on', 'ng', 'nang', 'kay', 'the', 'a', 'an', 'ang', 'from',
  'to', 'into', 'received', 'receive', 'natanggap', 'got', 'transfer', 'transferred', 'move', 'moved', 'lipat', 'nilipat',
  'in', 'of', 'mula', 'galing',
];

const has = (text: string, words: string[]) => words.some((w) => wordRegex(w).test(text));

function removeSpan(text: string, piece: string | undefined): string {
  if (!piece) return text;
  const at = text.toLowerCase().indexOf(piece.toLowerCase());
  return at < 0 ? text : `${text.slice(0, at)} ${text.slice(at + piece.length)}`;
}

function tidy(words: string[]): string {
  return words.join(' ').replace(/\s+/g, ' ').trim().replace(/^[-–:,.]+|[-–:,.]+$/g, '').trim();
}

export function parseEntry(input: string, context: ParseContext): ParsedEntry {
  const now = context.now ?? new Date();
  const text = input.trim();
  const fallback = defaultAccount(context.accounts);
  const currency = context.currency ?? 'PHP';

  // 1. Date phrase (so "3 days ago" isn't read as an amount).
  const date = findDate(text, now);
  let rest = removeSpan(text, date?.text);

  // 2. Amount.
  const amount = findAmount(rest, currency);
  rest = removeSpan(rest, amount?.text);

  // 3. Accounts, in the order mentioned.
  const accountMatches = findAccounts(rest, context.accounts);
  for (const m of accountMatches) rest = removeSpan(rest, m.text);

  // 4. Type.
  const lower = text.toLowerCase();
  const cards = accountMatches.filter((m) => m.account.type === 'credit_card' || m.account.type === 'loan');
  const twoAccounts = accountMatches.length >= 2;
  // "sa" (at/to) is too common in Taglish to signal a transfer on its own.
  const toRe = /(?<![\p{L}])(to|into|papunta sa|papuntang)(?![\p{L}])/iu;
  let type: ParsedEntry['type'] = 'expense';
  let accountUuid = accountMatches[0]?.account.uuid ?? null;
  let toAccountUuid: string | null = null;

  if (twoAccounts && (has(lower, TRANSFER_WORDS) || toRe.test(lower) || has(lower, PAY_WORDS))) {
    // "gcash to bdo 1000", "transfer 1000 from bdo to gcash", "paid card from bdo"
    type = 'transfer';
    const [first, second] = accountMatches;
    const firstIsTarget = (first!.account.type === 'credit_card' || first!.account.type === 'loan') && has(lower, PAY_WORDS);
    accountUuid = firstIsTarget ? second!.account.uuid : first!.account.uuid;
    toAccountUuid = firstIsTarget ? first!.account.uuid : second!.account.uuid;
  } else if (cards.length && has(lower, PAY_WORDS)) {
    // "Paid credit card 5k": from the everyday account to the card.
    type = 'transfer';
    toAccountUuid = cards[0]!.account.uuid;
    const source = accountMatches.find((m) => m.account.uuid !== toAccountUuid)?.account ?? fallback;
    accountUuid = source && source.uuid !== toAccountUuid ? source.uuid : null;
  } else if (accountMatches.length === 1 && has(lower, TRANSFER_WORDS) && toRe.test(lower)) {
    // "transfer 500 to gcash": from the default account.
    type = 'transfer';
    toAccountUuid = accountMatches[0]!.account.uuid;
    accountUuid = fallback && fallback.uuid !== toAccountUuid ? fallback.uuid : null;
  } else if (has(lower, INCOME_WORDS) || /^\s*\+/.test(text)) {
    type = 'income';
  }

  // 5. Counterparty in "received … from Mark".
  let counterparty: string | undefined;
  if (type !== 'transfer' && has(lower, RECEIVE_WORDS)) {
    const from = /(?<![\p{L}])(?:from|kay|galing kay|mula kay|galing sa|mula sa)\s+([\p{L}][\p{L}.' -]*)/iu.exec(rest);
    if (from) {
      counterparty = tidy(from[1]!.split(/\s+/).filter((w) => !FILLER.includes(w.toLowerCase())));
      type = 'income';
    }
  }

  // 6. Merchant: whatever is left once filler words go.
  const words = rest
    .replace(/^\s*\+/, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !FILLER.includes(w.toLowerCase()) && !INCOME_WORDS.includes(w.toLowerCase()));
  const merchant = counterparty || tidy(words);

  // 7. Category (transfers have none). An income keyword can also turn an
  //    unmarked phrase into income: "Sweldo 25k", "Freelance 8000".
  let categoryUuid: string | null = null;
  let categorySource: CategorySource | null = null;
  if (type !== 'transfer') {
    const lookup = (kind: 'expense' | 'income' | null) =>
      resolveCategory({
        merchant,
        text,
        kind,
        categories: context.categories,
        mappings: context.mappings ?? [],
        dictionary: context.dictionary ?? [],
      });
    const found = type === 'income' ? lookup('income') : lookup(null);
    if (found) {
      categoryUuid = found.category.uuid;
      categorySource = found.source;
      if (type === 'expense' && found.category.kind === 'income') type = 'income';
    }
  }

  if (type !== 'transfer' && !accountUuid) accountUuid = fallback?.uuid ?? null;

  const debtMatches =
    counterparty && type === 'income'
      ? (context.debts ?? []).filter(
          (d) => !d.settled && d.direction === 'owed_to_me' && normalizeMerchant(d.counterparty) === normalizeMerchant(counterparty!),
        )
      : [];

  return {
    type,
    amountMinor: amount?.amountMinor ?? null,
    currency: amount?.currency,
    occurredAt: date?.date ?? now,
    dateText: date?.text,
    merchant,
    accountUuid,
    toAccountUuid,
    categoryUuid,
    categorySource,
    counterparty,
    confirm: counterparty && type === 'income' ? 'income-or-debt' : undefined,
    debtMatches,
  };
}
