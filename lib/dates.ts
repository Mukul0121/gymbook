const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function getTodayIST(): string {
  const istMs = Date.now() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().split('T')[0]; // YYYY-MM-DD
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().split('T')[0];
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export type MemberStatus = 'active' | 'expiring_soon' | 'expired';

export function getMemberStatus(expiryDate: string, reminderDays = 3): MemberStatus {
  const today = getTodayIST();
  const [ty, tm, td] = today.split('-').map(Number);
  const [ey, em, ed] = expiryDate.split('-').map(Number);

  const todayMs = Date.UTC(ty, tm - 1, td);
  const expiryMs = Date.UTC(ey, em - 1, ed);
  const diffDays = Math.floor((expiryMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= reminderDays) return 'expiring_soon';
  return 'active';
}