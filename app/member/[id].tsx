import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { formatDisplayDate } from '../../lib/dates';
import { cleanPhoneNumber } from '../../lib/phone';
import { supabase } from '../../lib/supabase';

type MemberDetail = {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  isArchived: boolean;
  planName: string;
  startDate: string;
  expiryDate: string;
  paymentStatus: 'paid' | 'unpaid';
};

export default function MemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadMember = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from('members')
        .select(`
          id, name, phone, notes, is_archived,
          memberships (
            start_date, expiry_date, status,
            plans ( name )
          )
        `)
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      const sorted = [...((data as any).memberships ?? [])].sort((a, b) =>
        b.expiry_date.localeCompare(a.expiry_date)
      );
      const latest = sorted[0];

      const detail: MemberDetail = {
        id: data.id,
        name: data.name,
        phone: data.phone,
        notes: data.notes,
        isArchived: Boolean(data.is_archived),
        planName: latest?.plans?.name ?? 'No plan',
        startDate: latest?.start_date ?? '',
        expiryDate: latest?.expiry_date ?? '',
        paymentStatus: latest?.status ?? 'unpaid',
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
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              editable={!saving}
            />

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
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save</Text>
                )}
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
                <Text style={styles.infoValue}>{member.planName}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Start date</Text>
                <Text style={styles.infoValue}>{formatDisplayDate(member.startDate) || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Expiry date</Text>
                <Text style={styles.infoValue}>{formatDisplayDate(member.expiryDate) || '—'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment status</Text>
                <Text
                  style={[
                    styles.statusBadge,
                    member.paymentStatus === 'paid' ? styles.paidBadge : styles.unpaidBadge,
                  ]}
                >
                  {member.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
                </Text>
              </View>

              {member.notes ? (
                <View style={styles.notesBox}>
                  <Text style={styles.infoLabel}>Notes</Text>
                  <Text style={styles.notesText}>{member.notes}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.callBtn, { flex: 1 }]} onPress={handleCall}>
                <Text style={styles.primaryBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.waBtn, { flex: 1 }]} onPress={handleWhatsApp}>
                <Text style={styles.primaryBtnText}>WhatsApp</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.btn, styles.secondaryBtn]} onPress={() => setEditing(true)}>
              <Text style={styles.secondaryBtnText}>Edit details</Text>
            </TouchableOpacity>

            {member.isArchived ? (
              <TouchableOpacity style={[styles.btn, styles.restoreBtn]} onPress={handleRestore}>
                <Text style={styles.restoreBtnText}>Restore member</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[styles.btn, styles.archiveBtn]} onPress={handleArchive}>
                <Text style={styles.archiveBtnText}>Archive member</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
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
  primaryBtn: { backgroundColor: '#111' },
  callBtn: { backgroundColor: '#111', marginBottom: 0 },
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
  input: { borderWidth: 1.5, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16, color: '#111', marginBottom: 6 },
  errorText: { color: '#d32f2f', fontSize: 15, marginVertical: 10, textAlign: 'center' },
  retryBtn: { backgroundColor: '#111', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});