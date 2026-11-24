import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { formatDisplayDate, getMemberStatus, MemberStatus } from '../../lib/dates';
import { supabase } from '../../lib/supabase';

type FilterType = 'all' | 'expiring_soon' | 'expired' | 'unpaid' | 'archived';

type MemberCardItem = {
  id: string;
  name: string;
  phone: string;
  isArchived: boolean;
  planName: string;
  expiryDate: string;
  paymentStatus: 'paid' | 'unpaid';
  memberStatus: MemberStatus;
};

const BADGE_CONFIG: Record<MemberStatus, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: '#dcfce7', text: '#166534' },
  expiring_soon: { label: 'Expiring soon', bg: '#fef3c7', text: '#92400e' },
  expired: { label: 'Expired', bg: '#fee2e2', text: '#991b1b' },
};

export default function MembersScreen() {
  const [members, setMembers] = useState<MemberCardItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data: gym } = await supabase
        .from('gyms')
        .select('id, reminder_days')
        .limit(1)
        .single();
      if (!gym) return;

      const { data, error: fetchErr } = await supabase
        .from('members')
        .select(`
          id, name, phone, is_archived,
          memberships (
            start_date, expiry_date, status, created_at,
            plans ( name )
          )
        `)
        .eq('gym_id', gym.id)
        .order('name');

      if (fetchErr) throw fetchErr;

      const mapped: MemberCardItem[] = (data ?? []).map((m: any) => {
        const sorted = [...(m.memberships ?? [])].sort((a, b) =>
          b.expiry_date.localeCompare(a.expiry_date)
        );
        const latest = sorted[0];
        const expiryDate = latest?.expiry_date ?? '';
        return {
          id: m.id,
          name: m.name,
          phone: m.phone,
          isArchived: Boolean(m.is_archived),
          planName: latest?.plans?.name ?? 'No plan',
          expiryDate,
          paymentStatus: latest?.status ?? 'unpaid',
          memberStatus: expiryDate ? getMemberStatus(expiryDate, gym.reminder_days) : 'expired',
        };
      });

      setMembers(mapped);
    } catch (err: any) {
      setError(err.message || 'Could not load members.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers])
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.phone.includes(q);
      if (!matchesSearch) return false;

      if (filter === 'archived') return m.isArchived;
      if (m.isArchived) return false;

      if (filter === 'expiring_soon') return m.memberStatus === 'expiring_soon';
      if (filter === 'expired') return m.memberStatus === 'expired';
      if (filter === 'unpaid') return m.paymentStatus === 'unpaid';
      return true;
    });
  }, [members, search, filter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'expiring_soon', label: 'Expiring soon' },
    { key: 'expired', label: 'Expired' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.searchBox}
        placeholder="Search by name or phone..."
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.filterRow}>
        {filters.map((f) => {
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#111" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => loadMembers()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredMembers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadMembers(true)} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {filter === 'archived'
                ? 'No archived members.'
                : 'No members found. Tap + to add your first member.'}
            </Text>
          }
          renderItem={({ item }) => {
            const badge = item.isArchived
              ? { label: 'Archived', bg: '#e5e7eb', text: '#374151' }
              : BADGE_CONFIG[item.memberStatus];
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => router.push(`/member/${item.id}` as any)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.memberName}>{item.name}</Text>
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>
                <View style={styles.cardBottom}>
                  <Text style={styles.meta}>{item.planName}</Text>
                  <Text style={styles.meta}>
                    {item.expiryDate ? `Ends ${formatDisplayDate(item.expiryDate)}` : 'No active plan'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => router.navigate('/(tabs)/add')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', paddingHorizontal: 16, paddingTop: 12 },
  searchBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#e5e7eb' },
  chipActive: { backgroundColor: '#111' },
  chipText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  memberName: { fontSize: 18, fontWeight: 'bold', color: '#111', flex: 1, marginRight: 8 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 13, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 14, color: '#555' },
  emptyText: { textAlign: 'center', color: '#666', fontSize: 16, marginTop: 40 },
  center: { alignItems: 'center', marginTop: 40 },
  errorText: { color: '#d32f2f', fontSize: 16, marginBottom: 12 },
  retryBtn: { backgroundColor: '#111', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 32, lineHeight: 34 },
});