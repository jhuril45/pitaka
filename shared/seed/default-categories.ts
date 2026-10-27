import type { DefaultCategoryRecord } from '../schemas/server';

/**
 * Categories copied into a new profile. Keywords (English + Taglish) feed the
 * smart-text parser's keyword fallback.
 *
 * Bundled for offline first launch; the live copy is the shared
 * `DefaultCategorySet` class seeded by cloud/main.js. A test keeps them identical.
 */
export const DEFAULT_CATEGORIES: DefaultCategoryRecord[] = [
  // ---- Expense
  { key: 'food', parentKey: null, name: 'Food', kind: 'expense', icon: 'food', color: '#F97316', sortOrder: 10, keywords: ['food', 'pagkain', 'kain', 'meal'] },
  { key: 'food.groceries', parentKey: 'food', name: 'Groceries', kind: 'expense', icon: 'cart', color: '#F97316', sortOrder: 11, keywords: ['grocery', 'groceries', 'supermarket', 'palengke', 'market', 'sm', 'puregold', 'robinsons', 'savemore', 'grocer'] },
  { key: 'food.dining', parentKey: 'food', name: 'Dining', kind: 'expense', icon: 'dining', color: '#F97316', sortOrder: 12, keywords: ['lunch', 'dinner', 'breakfast', 'merienda', 'tanghalian', 'hapunan', 'almusal', 'jollibee', 'mcdo', 'mcdonalds', 'chowking', 'mang inasal', 'kfc', 'restaurant', 'foodpanda', 'grabfood'] },
  { key: 'food.coffee', parentKey: 'food', name: 'Coffee', kind: 'expense', icon: 'coffee', color: '#F97316', sortOrder: 13, keywords: ['coffee', 'kape', 'starbucks', 'tim hortons', 'coffee project', 'bo\'s', 'cafe'] },
  { key: 'transport', parentKey: null, name: 'Transport', kind: 'expense', icon: 'car', color: '#3B82F6', sortOrder: 20, keywords: ['transport', 'pamasahe', 'fare', 'commute'] },
  { key: 'transport.fuel', parentKey: 'transport', name: 'Fuel', kind: 'expense', icon: 'fuel', color: '#3B82F6', sortOrder: 21, keywords: ['gas', 'gasolina', 'fuel', 'diesel', 'petron', 'shell', 'caltex', 'seaoil'] },
  { key: 'transport.ride_hailing', parentKey: 'transport', name: 'Grab & taxi', kind: 'expense', icon: 'taxi', color: '#3B82F6', sortOrder: 22, keywords: ['grab', 'angkas', 'joyride', 'move it', 'taxi', 'uber'] },
  { key: 'transport.commute', parentKey: 'transport', name: 'Jeep, bus & train', kind: 'expense', icon: 'bus', color: '#3B82F6', sortOrder: 23, keywords: ['jeep', 'jeepney', 'bus', 'mrt', 'lrt', 'tricycle', 'trike', 'beep', 'pamasahe'] },
  { key: 'transport.parking', parentKey: 'transport', name: 'Parking & tolls', kind: 'expense', icon: 'parking', color: '#3B82F6', sortOrder: 24, keywords: ['parking', 'toll', 'autosweep', 'easytrip', 'rfid'] },
  { key: 'bills', parentKey: null, name: 'Bills', kind: 'expense', icon: 'bill', color: '#8B5CF6', sortOrder: 30, keywords: ['bill', 'bills', 'bayarin'] },
  { key: 'bills.electricity', parentKey: 'bills', name: 'Electricity', kind: 'expense', icon: 'bolt', color: '#8B5CF6', sortOrder: 31, keywords: ['meralco', 'kuryente', 'electricity', 'electric', 'veco', 'davao light'] },
  { key: 'bills.water', parentKey: 'bills', name: 'Water', kind: 'expense', icon: 'water', color: '#8B5CF6', sortOrder: 32, keywords: ['tubig', 'water', 'maynilad', 'manila water'] },
  { key: 'bills.internet', parentKey: 'bills', name: 'Internet', kind: 'expense', icon: 'wifi', color: '#8B5CF6', sortOrder: 33, keywords: ['internet', 'wifi', 'pldt', 'converge', 'globe at home', 'sky fiber'] },
  { key: 'bills.mobile', parentKey: 'bills', name: 'Mobile & load', kind: 'expense', icon: 'phone', color: '#8B5CF6', sortOrder: 34, keywords: ['load', 'globe', 'smart', 'tnt', 'tm', 'dito', 'postpaid', 'prepaid'] },
  { key: 'housing', parentKey: null, name: 'Housing', kind: 'expense', icon: 'home', color: '#0EA5E9', sortOrder: 40, keywords: ['rent', 'upa', 'renta', 'dorm', 'condo', 'association dues', 'amortization'] },
  { key: 'shopping', parentKey: null, name: 'Shopping', kind: 'expense', icon: 'bag', color: '#EC4899', sortOrder: 50, keywords: ['shopping', 'shopee', 'lazada', 'tiktok shop', 'clothes', 'damit', 'uniqlo', 'zalora'] },
  { key: 'health', parentKey: null, name: 'Health', kind: 'expense', icon: 'health', color: '#EF4444', sortOrder: 60, keywords: ['gamot', 'medicine', 'mercury drug', 'watsons', 'doctor', 'hospital', 'checkup', 'dentist', 'philhealth'] },
  { key: 'entertainment', parentKey: null, name: 'Entertainment', kind: 'expense', icon: 'ticket', color: '#A855F7', sortOrder: 70, keywords: ['movie', 'sine', 'netflix', 'spotify', 'youtube premium', 'disney', 'games', 'steam', 'concert'] },
  { key: 'education', parentKey: null, name: 'Education', kind: 'expense', icon: 'school', color: '#14B8A6', sortOrder: 80, keywords: ['tuition', 'matrikula', 'school', 'eskwela', 'books', 'libro', 'course'] },
  { key: 'family', parentKey: null, name: 'Family & padala', kind: 'expense', icon: 'family', color: '#F59E0B', sortOrder: 90, keywords: ['padala', 'remittance', 'allowance ng anak', 'baon', 'family', 'pamilya'] },
  { key: 'personal_care', parentKey: null, name: 'Personal care', kind: 'expense', icon: 'care', color: '#F472B6', sortOrder: 100, keywords: ['haircut', 'gupit', 'salon', 'barber', 'spa', 'massage', 'toiletries'] },
  { key: 'travel', parentKey: null, name: 'Travel', kind: 'expense', icon: 'plane', color: '#06B6D4', sortOrder: 110, keywords: ['flight', 'cebu pacific', 'pal', 'airasia', 'hotel', 'airbnb', 'agoda', 'travel', 'bakasyon'] },
  { key: 'fees', parentKey: null, name: 'Fees & charges', kind: 'expense', icon: 'fee', color: '#64748B', sortOrder: 120, keywords: ['fee', 'charge', 'service charge', 'bank fee', 'annual fee', 'interest charge', 'penalty'] },
  { key: 'gifts', parentKey: null, name: 'Gifts & donations', kind: 'expense', icon: 'gift', color: '#E11D48', sortOrder: 130, keywords: ['gift', 'regalo', 'donation', 'abuloy', 'tithe', 'ninong', 'ninang', 'pamasko'] },
  { key: 'other_expense', parentKey: null, name: 'Other', kind: 'expense', icon: 'other', color: '#94A3B8', sortOrder: 999, keywords: [] },
  // ---- Income
  { key: 'salary', parentKey: null, name: 'Salary', kind: 'income', icon: 'salary', color: '#16A34A', sortOrder: 10, keywords: ['salary', 'sweldo', 'suweldo', 'sahod', 'payroll', 'payday', '13th month'] },
  { key: 'freelance', parentKey: null, name: 'Freelance', kind: 'income', icon: 'laptop', color: '#16A34A', sortOrder: 20, keywords: ['freelance', 'raket', 'client', 'upwork', 'project', 'commission'] },
  { key: 'business', parentKey: null, name: 'Business', kind: 'income', icon: 'store', color: '#16A34A', sortOrder: 30, keywords: ['sales', 'benta', 'business', 'negosyo', 'tindahan'] },
  { key: 'allowance', parentKey: null, name: 'Allowance', kind: 'income', icon: 'wallet', color: '#16A34A', sortOrder: 40, keywords: ['allowance', 'baon', 'padala'] },
  { key: 'interest', parentKey: null, name: 'Interest & dividends', kind: 'income', icon: 'chart', color: '#16A34A', sortOrder: 50, keywords: ['interest', 'dividend', 'tubo'] },
  { key: 'gifts_received', parentKey: null, name: 'Gifts received', kind: 'income', icon: 'gift', color: '#16A34A', sortOrder: 60, keywords: ['gift', 'regalo', 'aguinaldo', 'pamasko'] },
  { key: 'refunds', parentKey: null, name: 'Refunds', kind: 'income', icon: 'refund', color: '#16A34A', sortOrder: 70, keywords: ['refund', 'cashback', 'rebate', 'reimbursement'] },
  { key: 'other_income', parentKey: null, name: 'Other income', kind: 'income', icon: 'other', color: '#16A34A', sortOrder: 999, keywords: [] },
];
