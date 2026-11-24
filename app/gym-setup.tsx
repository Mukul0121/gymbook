import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../lib/supabase';

type PlanDraft = {
  name: string;
  duration_days: string;
  price: string;
};

export default function GymSetupScreen() {
  const [gymName, setGymName] = useState('');
  const [plans, setPlans] = useState<PlanDraft[]>([
    { name: 'Monthly', duration_days: '30', price: '' },
    { name: 'Quarterly', duration_days: '90', price: '' },
    { name: 'Yearly', duration_days: '365', price: '' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePlan(index: number, field: keyof PlanDraft, value: string) {
    setPlans((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  }

  function addPlan() {
    setPlans((prev) => [...prev, { name: '', duration_days: '30', price: '' }]);
  }

  function removePlan(index: number) {
    if (plans.length <= 1) return;
    setPlans((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleStart() {
    setError(null);

    if (!gymName.trim()) {
      setError('Please enter your gym name.');
      return;
    }

    const validPlans = plans.map((p) => ({
      name: p.name.trim(),
      duration_days: parseInt(p.duration_days, 10),
      price: parseInt(p.price, 10),
    }));

    for (const p of validPlans) {
      if (!p.name || isNaN(p.duration_days) || p.duration_days <= 0 || isNaN(p.price) || p.price <= 0) {
        setError('Please fill in a valid name, days, and price (₹) for every plan.');
        return;
      }
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You are not logged in. Please try again.');

      const { data: gym, error: gymError } = await supabase
        .from('gyms')
        .insert({
          owner_id: user.id,
          name: gymName.trim(),
          owner_phone: user.phone ?? '',
        })
        .select()
        .single();

      if (gymError) throw gymError;

      const plansToInsert = validPlans.map((p) => ({
        gym_id: gym.id,
        name: p.name,
        duration_days: p.duration_days,
        price: p.price,
      }));

      const { error: plansError } = await supabase.from('plans').insert(plansToInsert);
      if (plansError) throw plansError;

      router.replace('/(tabs)');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Set up your gym</Text>

        <Text style={styles.label}>Gym name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Iron House Gym"
          value={gymName}
          onChangeText={setGymName}
          editable={!loading}
        />

        <Text style={styles.sectionTitle}>Membership plans</Text>
        {plans.map((plan, index) => (
          <View key={index} style={styles.planCard}>
            <View style={styles.planHeader}>
              <TextInput
                style={styles.planNameInput}
                placeholder="Plan name"
                value={plan.name}
                onChangeText={(v) => updatePlan(index, 'name', v)}
                editable={!loading}
              />
              {plans.length > 1 && (
                <TouchableOpacity onPress={() => removePlan(index)}>
                  <Text style={styles.removeText}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.smallLabel}>Days</Text>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="number-pad"
                  value={plan.duration_days}
                  onChangeText={(v) => updatePlan(index, 'duration_days', v)}
                  editable={!loading}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.smallLabel}>Price (₹)</Text>
                <TextInput
                  style={styles.smallInput}
                  placeholder="e.g. 1000"
                  keyboardType="number-pad"
                  value={plan.price}
                  onChangeText={(v) => updatePlan(index, 'price', v)}
                  editable={!loading}
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={addPlan} disabled={loading}>
          <Text style={styles.addButtonText}>+ Add another plan</Text>
        </TouchableOpacity>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.startButton, loading && styles.buttonDisabled]}
          onPress={handleStart}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.startButtonText}>Start</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 64, paddingBottom: 140, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, color: '#111' },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#222' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 12, color: '#111' },
  input: {
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 14,
    fontSize: 18,
    color: '#111',
  },
  planCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    backgroundColor: '#fafafa',
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  planNameInput: { flex: 1, fontSize: 18, fontWeight: '600', color: '#111', borderBottomWidth: 1, borderColor: '#ddd', paddingBottom: 4, marginRight: 12 },
  removeText: { color: '#d32f2f', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  smallLabel: { fontSize: 14, color: '#555', marginBottom: 4 },
  smallInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fff', color: '#111' },
  addButton: { paddingVertical: 12, alignItems: 'center', marginBottom: 16 },
  addButtonText: { fontSize: 16, fontWeight: '600', color: '#111' },
  error: { color: '#d32f2f', fontSize: 15, marginBottom: 12 },
  startButton: { backgroundColor: '#111', paddingVertical: 18, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  startButtonText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});