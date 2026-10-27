import {
  accountSchema,
  holdingSchema,
  MONEY_FIELDS,
  recurringRuleSchema,
  settingSchema,
  transactionSchema,
  USER_DATA_CLASSES,
  userDataSchemas,
} from '@shared/index';

const now = '2026-10-27T08:00:00.000+08:00';
const ids = {
  record: '3b241101-e2bb-4255-8caf-4136c566a962',
  profile: '0f8fad5b-d9cb-469f-a165-70867728950e',
  account: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  account2: '16fd2706-8baf-433b-82eb-8c7fada847da',
  category: '886313e1-3b8a-4372-9b90-0c9aee199e5d',
};

const base = { uuid: ids.record, profileUuid: ids.profile, clientUpdatedAt: now, deletedAt: null };

const expense = {
  ...base,
  type: 'expense' as const,
  amountMinor: 25000,
  accountUuid: ids.account,
  toAccountUuid: null,
  categoryUuid: ids.category,
  occurredAt: now,
  note: '',
  merchant: 'Starbucks',
  source: 'manual' as const,
  recurringRuleUuid: null,
  installmentUuid: null,
};

describe('transactionSchema', () => {
  it('accepts a valid expense', () => {
    expect(transactionSchema.safeParse(expense).success).toBe(true);
  });

  it('rejects float money', () => {
    const result = transactionSchema.safeParse({ ...expense, amountMinor: 250.5 });
    expect(result.success).toBe(false);
  });

  it('rejects zero or negative amounts for non-adjustments', () => {
    expect(transactionSchema.safeParse({ ...expense, amountMinor: 0 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...expense, amountMinor: -100 }).success).toBe(false);
  });

  it('allows negative adjustments but not zero', () => {
    expect(transactionSchema.safeParse({ ...expense, type: 'adjustment', amountMinor: -500 }).success).toBe(true);
    expect(transactionSchema.safeParse({ ...expense, type: 'adjustment', amountMinor: 0 }).success).toBe(false);
  });

  it('requires a different destination for transfers', () => {
    const transfer = { ...expense, type: 'transfer' as const, categoryUuid: null };
    expect(transactionSchema.safeParse(transfer).success).toBe(false);
    expect(transactionSchema.safeParse({ ...transfer, toAccountUuid: ids.account }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...transfer, toAccountUuid: ids.account2 }).success).toBe(true);
  });

  it('rejects a destination on non-transfers', () => {
    expect(transactionSchema.safeParse({ ...expense, toAccountUuid: ids.account2 }).success).toBe(false);
  });

  it('rejects malformed uuids and dates', () => {
    expect(transactionSchema.safeParse({ ...expense, uuid: 'abc' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...expense, occurredAt: 'yesterday' }).success).toBe(false);
  });
});

describe('other schemas', () => {
  it('validates accounts with PHP defaults', () => {
    const account = {
      ...base,
      name: 'GCash',
      type: 'ewallet',
      currency: 'PHP',
      openingBalanceMinor: 150000,
      creditLimitMinor: null,
      icon: 'wallet',
      color: '#0A6CFF',
      archived: false,
      sortOrder: 0,
      templateKey: 'gcash',
    };
    expect(accountSchema.safeParse(account).success).toBe(true);
    expect(accountSchema.safeParse({ ...account, currency: 'peso' }).success).toBe(false);
  });

  it('keeps holding quantities as decimal strings', () => {
    const holding = {
      ...base,
      accountUuid: ids.account,
      symbol: 'btc',
      assetClass: 'crypto',
      quantity: '0.00012345',
      avgCostMinor: 350000000,
      currency: 'PHP',
      manualPriceMinor: null,
    };
    const parsed = holdingSchema.parse(holding);
    expect(parsed.symbol).toBe('BTC');
    expect(holdingSchema.safeParse({ ...holding, quantity: 0.5 }).success).toBe(false);
    expect(holdingSchema.safeParse({ ...holding, quantity: '-1' }).success).toBe(false);
  });

  it('validates recurring templates with transaction rules', () => {
    const rule = {
      ...base,
      name: 'Netflix',
      template: {
        type: 'expense',
        amountMinor: 54900,
        accountUuid: ids.account,
        toAccountUuid: null,
        categoryUuid: ids.category,
        note: '',
        merchant: 'Netflix',
      },
      frequency: 'monthly',
      interval: 1,
      byMonthDay: 15,
      nextRunAt: now,
      endAt: null,
      kind: 'subscription',
      remindDaysBefore: 3,
      autoPost: false,
    };
    expect(recurringRuleSchema.safeParse(rule).success).toBe(true);
    expect(
      recurringRuleSchema.safeParse({ ...rule, template: { ...rule.template, amountMinor: 549.0001 } }).success,
    ).toBe(false);
  });

  it('accepts JSON setting values only', () => {
    const setting = { ...base, key: 'txWindowMonths', value: 12 };
    expect(settingSchema.safeParse(setting).success).toBe(true);
    expect(settingSchema.safeParse({ ...setting, value: { nested: [1, 'a', null] } }).success).toBe(true);
    expect(settingSchema.safeParse({ ...setting, value: new Date() }).success).toBe(false);
  });
});

describe('registry', () => {
  it('lists every user-data class with its money fields', () => {
    expect(USER_DATA_CLASSES).toHaveLength(17);
    for (const className of USER_DATA_CLASSES) {
      expect(userDataSchemas[className]).toBeDefined();
      expect(MONEY_FIELDS[className]).toBeDefined();
    }
  });
});
