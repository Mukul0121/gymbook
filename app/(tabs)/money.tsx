import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { addDays, formatDisplayDate, getTodayIST } from '../../lib/dates';
import { supabase } from '../../lib/supabase';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type PaymentListItem = {
  id: string;
  memberName: string;
  amount: number;
  method: string;
  paidAt: string;
};

export default function MoneyScreen() {
  const today = getTodayIST();
  const [year, setYear] = useState(parseInt(today.slice(0, 4), 10));
  const [month, setMonth] = useState(parseInt(today.slice(5, 7), 10)); // 1-12

  const [collected, setCollected] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMoneyData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        // Month boundaries in IST (+05:30)
        const monthStr = String(month).padStart(2, '0');
        const nextYear = month === 12 ? year + 1 : year;
        const nextMonthStr = String(month === 12 ? 1 : month + 1).padStart(2, '0');
        const startISO = `${year}-${monthStr}-01T00:00:00+05:30`;
        const endISO = `${nextYear}-${nextMonthStr}-01T00:00:00+05:30`;

        // 1. Payments for selected month
        const { data: payRows, error: payErr } = await supabase
          .from('payments')
          .select(`
            id, amount, method, paid_at,
            memberships (
              members ( name )
            )
          `)
          .gte('paid_at', startISO)
          .lt('paid_at', endISO)
          .order('paid_at', { ascending: false });

        if (payErr) throw payErr;

        const mappedPayments: PaymentListItem[] = (payRows ?? []).map((p: any) => ({
          id: p.id,
          memberName: p.memberships?.members?.name ?? 'Unknown',
          amount: p.amount,
          method: p.method,
          paidAt: p.paid_at,
        }));

        setPayments(mappedPayments);
        setCollected(mappedPayments.reduce((sum, p) => sum + p.amount, 0));

        // 2. Pending (unpaid memberships for non-archived members)
        const { data: unpaidRows, error: unpaidErr } = await supabase
          .from('memberships')
          .select('amount_due, members!inner(is_archived)')
          .eq('status', 'unpaid')
          .eq('members.is_archived', false);

        if (unpaidErr) throw unpaidErr;
        setPendingAmount((unpaidRows ?? []).reduce((sum: number, r: any) => sum + r.amount_due, 0));

        // 3. Members expiring in the next 7 days
        const todayStr = getTodayIST();
        const in7Days = addDays(todayStr, 7);
        const { data: expRows, error: expErr } = await supabase
          .from('memberships')
          .select('member_id, members!inner(is_archived)')
          .gte('expiry_date', todayStr)
          .lte('expiry_date', in7Days)
          .eq('members.is_archived', false);

        if (expErr) throw expErr;
        const uniqueMembers = new Set((expRows ?? []).map((r: any) => r.member_id));
        setExpiringCount(uniqueMembers.size);
      } catch (err: any) {
        setError(err.message || 'Could not load money summary.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [year, month]
  );

  useFocusEffect(
    useCallback(() => {
      loadMoneyData();
    }, [loadMoneyData])
  );

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function formatMethod(method: string) {
    if (method === 'cash') return 'Cash';
    if (method === 'upi_manual') return 'UPI';
    if (method === 'upi_auto') return 'UPI (Auto)';
    return method;
  }

  return (
    <View style={styles.container}>
      {/* Month Picker */}
      <View style={styles.monthPicker}>
        <TouchableOpacity style={styles.arrowBtn} onPress={prevMonth}>
          <Text style={styles.arrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTHS[month - 1]} {year}
        </Text>
        <TouchableOpacity style={styles.arrowBtn} onPress={nextMonth}>
          <Text style={styles.arrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Three Summary Numbers */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Collected</Text>
          <Text style={[styles.statValue, { color: '#166534' }]}>₹{collected}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Pending</Text>
          <Text style={[styles.statValue, { color: '#991b1b' }]}>₹{pendingAmount}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Expiring (7d)</Text>
          <Text style={[styles.statValue, { color: '#92400e' }]}>{expiringCount}</Text>
        </View>
      </View>

      <Text style={styles.listTitle}>Payments in {MONTHS[month - 1]}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#111" style={{ marginTop: 32 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadMoneyData()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMoneyData(true)} />}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.emptyText}>No payments recorded this month.</Text>}
          renderItem={({ item }) => (
            <View style={styles.paymentRow}>
              <View>
                <Text style={styles.memberName}>{item.memberName}</Text>
                <Text style={styles.paymentMeta}>
                  {formatMethod(item.method)} · {formatDisplayDate(item.paidAt.split('T')[0])}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>₹{item.amount}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 12 },
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  arrowBtn: { paddingHorizontal: 14, paddingVertical: 4 },
  arrowText: { fontSize: 26, fontWeight: 'bold', color: '#111' },
  monthLabel: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  statLabel: { fontSize: 13, color: '#666', marginBottom: 4 },
  statValue: { fontSize: 19, fontWeight: 'bold' },
  listTitle: { fontSize: 17, fontWeight: 'bold', color: '#111', marginBottom: 10 },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
  },
  memberName: { fontSize: 16, fontWeight: '700', color: '#111' },
  paymentMeta: { fontSize: 13, color: '#666', marginTop: 2 },
  paymentAmount: { fontSize: 17, fontWeight: 'bold', color: '#166534' },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 15, marginTop: 32 },
  center: { alignItems: 'center', marginTop: 32 },
  errorText: { color: '#d32f2f', fontSize: 15, marginBottom: 12 },
  retryBtn: { backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});