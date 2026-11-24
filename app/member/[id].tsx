import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { addDays, formatDisplayDate, getTodayIST } from '../../lib/dates';
import { cleanPhoneNumber } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

type Plan = { id: string; name: string; duration_days: number; price: number };

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
};

type MembershipRow = {
  id: string;
  plan_id: string;
  planName: string;
  start_date: string;
  expiry_date: string;
  amount_due: number;
  status: 'paid' | 'unpaid';
  payments: PaymentRow[];
};

type MemberDetail = {
  id: string;
  gymId: string;
  name: string;
  phone: string;
  notes: string | null;
  isArchived: boolean;
  memberships: MembershipRow[];
};

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Mark as Paid sheet state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'upi_manual'>('cash');
  const [payLoading, setPayLoading] = useState(false);

  // Renew sheet state
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewPlanId, setRenewPlanId] = useState('');
  const [renewLoading, setRenewLoading] = useState(false);

  const loadMember = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('members')
        .select(`
          id, gym_id, name, phone, notes, is_archived,
          memberships (
            id, plan_id, start_date, expiry_date, amount_due, status,
            plans ( name ),
            payments ( id, amount, method, paid_at )
          )
        `)
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      const { data: planRows } = await supabase
        .from('plans')
        .select('id, name, duration_days, price')
        .eq('gym_id', data.gym_id)
        .eq('is_active', true)
        .order('duration_days');

      setPlans(planRows ?? []);

      const sortedMemberships: MembershipRow[] = [...((data as any).memberships ?? [])]
        .sort((a, b) => b.expiry_date.localeCompare(a.expiry_date))
        .map((ms: any) => ({
          id: ms.id,
          plan_id: ms.plan_id,
          planName: ms.plans?.name ?? 'Plan',
          start_date: ms.start_date,
          expiry_date: ms.expiry_date,
          amount_due: ms.amount_due,
          status: ms.status,
          payments: ms.payments ?? [],
        }));

      const detail: MemberDetail = {
        id: data.id,
        gymId: data.gym_id,
        name: data.name,
        phone: data.phone,
        notes: data.notes,
        isArchived: Boolean(data.is_archived),
        memberships: sortedMemberships,
      };

      setMember(detail);
      setEditName(detail.name);
      setEditPhone(detail.phone);
      setEditNotes(detail.notes ?? '');
    } catch (err: any) {
      setError(err.message || 'Could not load member details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadMember();
    }, [loadMember])
  );

  const currentMembership = member?.memberships[0] ?? null;

  function openPayModal() {
    if (!currentMembership) return;
    setPayAmount(String(currentMembership.amount_due));
    setPayMethod('cash');
    setPayModalOpen(true);
  }

  async function handleConfirmPayment() {
    if (!currentMembership || payLoading) return;
    const amt = parseInt(payAmount, 10);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid rupee amount.');
      return;
    }

    setPayLoading(true);
    try {
      const { error: rpcErr } = await supabase.rpc('record_payment_tx', {
        p_membership_id: currentMembership.id,
        p_amount: amt,
        p_method: payMethod,
      });

      if (rpcErr) throw rpcErr;

      setPayModalOpen(false);
      await loadMember();
    } catch (err: any) {
      Alert.alert('Payment not recorded', err.message || 'Please try again.');
    } finally {
      setPayLoading(false);
    }
  }

  function openRenewModal() {
    const defaultPlanId = currentMembership?.plan_id || plans[0]?.id || '';
    setRenewPlanId(defaultPlanId);
    setRenewModalOpen(true);
  }

  async function handleConfirmRenew() {
    if (!member || renewLoading) return;
    const plan = plans.find((p) => p.id === renewPlanId);
    if (!plan) {
      Alert.alert('Choose a plan', 'Please select a plan to renew.');
      return;
    }

    setRenewLoading(true);
    try {
      const today = getTodayIST();
      // Start the day after previous expiry, or today if already expired
      let newStart = today;
      if (currentMembership && currentMembership.expiry_date >= today) {
        newStart = addDays(currentMembership.expiry_date, 1);
      }
      const newExpiry = addDays(newStart, plan.duration_days);

      const { error: insErr } = await supabase.from('memberships').insert({
        member_id: member.id,
        plan_id: plan.id,
        start_date: newStart,
        expiry_date: newExpiry,
        amount_due: plan.price,
        status: 'unpaid',
      });

      if (insErr) throw insErr;

      setRenewModalOpen(false);
      await loadMember();
    } catch (err: any) {
      Alert.alert('Could not renew', err.message || 'Please try again.');
    } finally {
      setRenewLoading(false);
    }
  }

  function handleCall() {
    if (!member) return;
    Linking.openURL(`tel:${member.phone}`);
  }

  function handleWhatsApp() {
    if (!member) return;
    const digits = member.phone.replace('+', '');
    Linking.openURL(`https://wa.me/${digits}`);
  }

  async function handleSaveEdit() {
    if (!member) return;
    setEditError(null);

    if (!editName.trim()) {
      setEditError('Name cannot be empty.');
      return;
    }

    const cleaned = cleanPhoneNumber(editPhone);
    if (!cleaned) {
      setEditError('Please enter a valid 10-digit phone number.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('members')
        .update({
          name: editName.trim(),
          phone: cleaned,
          notes: editNotes.trim() || null,
        })
        .eq('id', member.id);

      if (updateErr) throw updateErr;

      setEditing(false);
      await loadMember();
    } catch (err: any) {
      setEditError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  function handleArchive() {
    if (!member) return;
    Alert.alert(
      'Archive member?',
      `${member.name} will be hidden from your active list. Their payment history will stay saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            const { error: archErr } = await supabase
              .from('members')
              .update({ is_archived: true })
              .eq('id', member.id);

            if (archErr) {
              Alert.alert('Error', archErr.message || 'Could not archive member.');
            } else {
              router.back();
            }
          },
        },
      ]
    );
  }

  async function handleRestore() {
    if (!member) return;
    const { error: restoreErr } = await supabase
      .from('members')
      .update({ is_archived: false })
      .eq('id', member.id);

    if (restoreErr) {
      Alert.alert('Error', restoreErr.message || 'Could not restore member.');
    } else {
      router.back();
    }
  }

  function formatMethod(method: string) {
    if (method === 'cash') return 'Cash';
    if (method === 'upi_manual') return 'UPI';
    if (method === 'upi_auto') return 'UPI (Auto)';
    return method;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  if (error || !member) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Member not found.'}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadMember}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {editing ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Edit member</Text>

            <Text style={styles.label}>Name</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} editable={!saving} />

            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={editPhone}
              onChangeText={setEditPhone}
              editable={!saving}
            />

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              multiline
              placeholder="e.g. Morning batch, prefers UPI"
              value={editNotes}
              onChangeText={setEditNotes}
              editable={!saving}
            />

            {editError && <Text style={styles.errorText}>{editError}</Text>}

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.secondaryBtn, { flex: 1 }]}
                onPress={() => {
                  setEditing(false);
                  setEditError(null);
                }}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.primaryBtn, { flex: 1 }]}
                onPress={handleSaveEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.phone}>{member.phone}</Text>

              <View style={styles.divider} />

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Current plan</Text>
                <Text style={styles.infoValue}>{currentMembership?.planName ?? 'No plan'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Start date</Text>
                <Text style={styles.infoValue}>
                  {currentMembership ? formatDisplayDate(currentMembership.start_date) : '—'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Expiry date</Text>
                <Text style={styles.infoValue}>
                  {currentMembership ? formatDisplayDate(currentMembership.expiry_date) : '—'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment status</Text>
                <Text
                  style={[
                    styles.statusBadge,
                    currentMembership?.status === 'paid' ? styles.paidBadge : styles.unpaidBadge,
                  ]}
                >
                  {currentMembership?.status === 'paid' ? 'Paid' : `Unpaid · ₹${currentMembership?.amount_due ?? 0}`}
                </Text>
              </View>

              {member.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.infoLabel}>Notes</Text>
                  <Text style={styles.notesText}>{member.notes}</Text>
                </View>
              ) : null}
            </View>

            {/* 1. Mark as Paid (large, shown only when unpaid) */}
            {currentMembership && currentMembership.status === 'unpaid' && (
              <TouchableOpacity style={[styles.btn, styles.markPaidBtn]} onPress={openPayModal}>
                <Text style={styles.markPaidText}>Mark as Paid (₹{currentMembership.amount_due})</Text>
              </TouchableOpacity>
            )}

            {/* 2. Renew */}
            <TouchableOpacity style={[styles.btn, styles.primaryBtn]} onPress={openRenewModal}>
              <Text style={styles.primaryBtnText}>Renew membership</Text>
            </TouchableOpacity>

            {/* 3. Call & WhatsApp */}
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.callBtn, { flex: 1 }]} onPress={handleCall}>
                <Text style={styles.primaryBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.waBtn, { flex: 1 }]} onPress={handleWhatsApp}>
                <Text style={styles.primaryBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>

            {/* 4. Edit */}
            <TouchableOpacity style={[styles.btn, styles.secondaryBtn]} onPress={() => setEditing(true)}>
              <Text style={styles.secondaryBtnText}>Edit details</Text>
            </TouchableOpacity>

            {/* 5. Archive / Restore */}
            {member.isArchived ? (
              <TouchableOpacity style={[styles.btn, styles.restoreBtn]} onPress={handleRestore}>
                <Text style={styles.restoreBtnText}>Restore member</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btn, styles.archiveBtn]} onPress={handleArchive}>
                <Text style={styles.archiveBtnText}>Archive member</Text>
              </TouchableOpacity>
            )}

            {/* History List */}
            <Text style={styles.historyHeader}>Membership & Payment History</Text>
            {member.memberships.map((ms) => (
              <View key={ms.id} style={styles.historyCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.historyPlan}>{ms.planName}</Text>
                  <Text
                    style={[
                      styles.statusBadge,
                      ms.status === 'paid' ? styles.paidBadge : styles.unpaidBadge,
                    ]}
                  >
                    {ms.status === 'paid' ? 'Paid' : 'Unpaid'}
                  </Text>
                </View>
                <Text style={styles.historyDates}>
                  {formatDisplayDate(ms.start_date)} → {formatDisplayDate(ms.expiry_date)}
                </Text>
                {ms.payments.length > 0 ? (
                  ms.payments.map((p) => (
                    <Text key={p.id} style={styles.historyPayment}>
                      Paid ₹{p.amount} via {formatMethod(p.method)} on{' '}
                      {formatDisplayDate(p.paid_at.split('T')[0])}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.historyUnpaid}>Amount due: ₹{ms.amount_due}</Text>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Mark as Paid Modal */}
      <Modal visible={payModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Record Payment</Text>

            <Text style={styles.label}>Amount (₹)</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={payAmount}
              onChangeText={setPayAmount}
              editable={!payLoading}
            />

            <Text style={styles.label}>Payment method</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.methodChip, payMethod === 'cash' && styles.methodChipActive]}
                onPress={() => setPayMethod('cash')}
              >
                <Text style={[styles.methodText, payMethod === 'cash' && styles.methodTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.methodChip, payMethod === 'upi_manual' && styles.methodChipActive]}
                onPress={() => setPayMethod('upi_manual')}
              >
                <Text style={[styles.methodText, payMethod === 'upi_manual' && styles.methodTextActive]}>UPI</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.row, { marginTop: 12 }]}>
              <TouchableOpacity
                style={[styles.btn, styles.secondaryBtn, { flex: 1, marginBottom: 0 }]}
                onPress={() => setPayModalOpen(false)}
                disabled={payLoading}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.markPaidBtn, { flex: 1, marginBottom: 0 }]}
                onPress={handleConfirmPayment}
                disabled={payLoading}
              >
                {payLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Renew Modal */}
      <Modal visible={renewModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Renew Membership</Text>
            <Text style={styles.modalSub}>Choose a plan for the next period (starts as unpaid):</Text>

            <View style={{ gap: 8, marginBottom: 16 }}>
              {plans.map((p) => {
                const active = p.id === renewPlanId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.planOption, active && styles.planOptionActive]}
                    onPress={() => setRenewPlanId(p.id)}
                  >
                    <Text style={[styles.planOptionText, active && styles.planOptionTextActive]}>
                      {p.name} ({p.duration_days} days) — ₹{p.price}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.secondaryBtn, { flex: 1, marginBottom: 0 }]}
                onPress={() => setRenewModalOpen(false)}
                disabled={renewLoading}
              >
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.primaryBtn, { flex: 1, marginBottom: 0 }]}
                onPress={handleConfirmRenew}
                disabled={renewLoading}
              >
                {renewLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Renew</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
  container: { padding: 20, paddingBottom: 80, backgroundColor: '#f9fafb', flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 16,
  },
  name: { fontSize: 24, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  phone: { fontSize: 17, color: '#555' },
  divider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  infoLabel: { fontSize: 15, color: '#666' },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#111' },
  statusBadge: { fontSize: 14, fontWeight: '700', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, overflow: 'hidden' },
  paidBadge: { backgroundColor: '#dcfce7', color: '#166534' },
  unpaidBadge: { backgroundColor: '#fee2e2', color: '#991b1b' },
  notesBox: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderColor: '#f3f4f6' },
  notesText: { fontSize: 15, color: '#222', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  btn: { paddingVertical: 15, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  markPaidBtn: { backgroundColor: '#16a34a', paddingVertical: 18 },
  markPaidText: { color: '#fff', fontSize: 19, fontWeight: 'bold' },
  primaryBtn: { backgroundColor: '#111' },
  callBtn: { backgroundColor: '#374151', marginBottom: 0 },
  waBtn: { backgroundColor: '#16a34a', marginBottom: 0 },
  secondaryBtn: { backgroundColor: '#e5e7eb' },
  archiveBtn: { backgroundColor: '#fee2e2' },
  restoreBtn: { backgroundColor: '#dcfce7' },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  secondaryBtnText: { color: '#111', fontSize: 17, fontWeight: '600' },
  archiveBtnText: { color: '#b91c1c', fontSize: 17, fontWeight: '600' },
  restoreBtnText: { color: '#166534', fontSize: 17, fontWeight: '600' },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 12 },
  label: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 17, color: '#111', marginBottom: 6 },
  errorText: { color: '#d32f2f', fontSize: 15, marginVertical: 10, textAlign: 'center' },
  retryBtn: { backgroundColor: '#111', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  historyHeader: { fontSize: 18, fontWeight: 'bold', color: '#111', marginTop: 16, marginBottom: 10 },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  historyPlan: { fontSize: 16, fontWeight: '700', color: '#111' },
  historyDates: { fontSize: 14, color: '#555', marginBottom: 6 },
  historyPayment: { fontSize: 14, color: '#166534', fontWeight: '600' },
  historyUnpaid: { fontSize: 14, color: '#991b1b', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 8 },
  modalSub: { fontSize: 15, color: '#555', marginBottom: 14 },
  methodChip: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  methodChipActive: { backgroundColor: '#111', borderColor: '#111' },
  methodText: { fontSize: 16, fontWeight: '600', color: '#222' },
  methodTextActive: { color: '#fff' },
  planOption: { padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#ddd' },
  planOptionActive: { backgroundColor: '#111', borderColor: '#111' },
  planOptionText: { fontSize: 16, fontWeight: '600', color: '#222' },
  planOptionTextActive: { color: '#fff' },
});