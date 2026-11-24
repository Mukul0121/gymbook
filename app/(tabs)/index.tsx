import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type Plan = { id: string; name: string; duration_days: number; price: number };

export default function MembersPlaceholderScreen() {
  const [gymName, setGymName] = useState<string>('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadGym() {
      const { data: gym } = await supabase.from('gyms').select('id, name').limit(1).single();
      if (gym) {
        setGymName(gym.name);
        const { data: planRows } = await supabase
          .from('plans')
          .select('id, name, duration_days, price')
          .eq('gym_id', gym.id)
          .order('duration_days');
        setPlans(planRows ?? []);
      }
      setLoading(false);
    }
    loadGym();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{gymName}</Text>
      <Text style={styles.subtitle}>Saved Plans:</Text>

      {plans.map((p) => (
        <View key={p.id} style={styles.planRow}>
          <Text style={styles.planName}>{p.name} ({p.duration_days} days)</Text>
          <Text style={styles.planPrice}>₹{p.price}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.logoutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  container: { flex: 1, padding: 24, paddingTop: 60, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#555', marginBottom: 16 },
  planRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    marginBottom: 10,
  },
  planName: { fontSize: 17, fontWeight: '600', color: '#111' },
  planPrice: { fontSize: 17, fontWeight: 'bold', color: '#111' },
  logoutButton: { marginTop: 32, padding: 14, borderRadius: 10, backgroundColor: '#eee', alignItems: 'center' },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#d32f2f' },
});