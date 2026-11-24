import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { addDays, getTodayIST } from '../../lib/dates';
import { cleanPhoneNumber } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

type Plan = { id: string; name: string; duration_days: number; price: number };

export default function AddScreen() {
  const [mode, setMode] = useState<'menu' | 'form'>('menu');
  const [gymId, setGymId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [startDate, setStartDate] = useState(getTodayIST());
  const [paidNow, setPaidNow] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      async function loadPlans() {
        const { data: gym } = await supabase.from('gyms').select('id').limit(1).single();
        if (!gym) return;
        setGymId(gym.id);

        const { data: planRows } = await supabase
          .from('plans')
          .select('id, name, duration_days, price')
          .eq('gym_id', gym.id)
          .eq('is_active', true)
          .order('duration_days');

        if (planRows && planRows.length > 0) {
          setPlans(planRows);
          setSelectedPlanId((prev) => prev || planRows[0].id);
        }
      }
      loadPlans();
    }, [])
  );

  async function handleSave() {
    setError(null);

    if (!name.trim()) {
      setError('Please enter the member name.');
      return;
    }

    const cleanedPhone = cleanPhoneNumber(phone);
    if (!cleanedPhone) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    const plan = plans.find((p) => p.id === selectedPlanId);
    if (!plan || !gymId) {
      setError('Please choose a membership plan.');
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())) {
      setError('Start date must be in YYYY-MM-DD format.');
      return;
    }

    setLoading(true);
    try {
      const expiryDate = addDays(startDate.trim(), plan.duration_days);

      const { data: member, error: mErr } = await supabase
        .from('members')
        .insert({ gym_id: gymId, name: name.trim(), phone: cleanedPhone })
        .select()
        .single();
      if (mErr) throw mErr;

      const { data: membership, error: msErr } = await supabase
        .from('memberships')
        .insert({
          member_id: member.id,
          plan_id: plan.id,
          start_date: startDate.trim(),
          expiry_date: expiryDate,
          amount_due: plan.price,
          status: paidNow ? 'paid' : 'unpaid',
        })
        .select()
        .single();
      if (msErr) throw msErr;

      if (paidNow) {
        const { error: payErr } = await supabase.from('payments').insert({
          membership_id: membership.id,
          amount: plan.price,
          method: 'cash',
        });
        if (payErr) throw payErr;
      }

      // Reset form and go back to Members list
      setName('');
      setPhone('');
      setStartDate(getTodayIST());
      setPaidNow(false);
      setMode('menu');
      router.navigate('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Could not save member. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'menu') {
    return (
      <View style={styles.menuContainer}>
        <TouchableOpacity style={styles.bigChoice} onPress={() => setMode('form')}>
          <Text style={styles.bigChoiceTitle}>Add one member</Text>
          <Text style={styles.bigChoiceSub}>Type name, phone, and plan</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bigChoice, styles.secondaryChoice]}
          onPress={() =>
            Alert.alert('Coming soon', 'Import from notebook photo will be built in Milestone 7.')
          }
        >
          <Text style={styles.bigChoiceTitle}>Import from notebook photo</Text>
          <Text style={styles.bigChoiceSub}>Snap a page to add many members at once</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
        <TouchableOpacity onPress={() => setMode('menu')} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Rahul Sharma"
          value={name}
          onChangeText={setName}
          editable={!loading}
        />

        <Text style={styles.label}>Phone number</Text>
        <TextInput
          style={styles.input}
          placeholder="10-digit mobile number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          editable={!loading}
        />

        <Text style={styles.label}>Plan</Text>
        <View style={styles.planList}>
          {plans.map((p) => {
            const active = p.id === selectedPlanId;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.planChip, active && styles.planChipActive]}
                onPress={() => setSelectedPlanId(p.id)}
              >
                <Text style={[styles.planChipText, active && styles.planChipTextActive]}>
                  {p.name} · ₹{p.price}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          value={startDate}
          onChangeText={setStartDate}
          editable={!loading}
        />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Paid now</Text>
          <Switch value={paidNow} onValueChange={setPaidNow} disabled={loading} />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.disabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save member</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  menuContainer: { flex: 1, padding: 20, justifyContent: 'center', gap: 16, backgroundColor: '#fff' },
  bigChoice: { backgroundColor: '#111', padding: 24, borderRadius: 16 },
  secondaryChoice: { backgroundColor: '#374151' },
  bigChoiceTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 6 },
  bigChoiceSub: { color: '#d1d5db', fontSize: 15 },
  formContainer: { padding: 20, paddingBottom: 120, backgroundColor: '#fff' },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 16, color: '#555', fontWeight: '600' },
  label: { fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 12, padding: 14, fontSize: 17, color: '#111' },
  planList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  planChip: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  planChipActive: { backgroundColor: '#111', borderColor: '#111' },
  planChipText: { fontSize: 15, fontWeight: '600', color: '#222' },
  planChipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 16 },
  switchLabel: { fontSize: 18, fontWeight: '600', color: '#111' },
  error: { color: '#d32f2f', fontSize: 15, marginBottom: 12 },
  saveBtn: { backgroundColor: '#111', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});