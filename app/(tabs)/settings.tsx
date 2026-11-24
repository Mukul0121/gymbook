import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.note}>More settings coming in Milestone 6.</Text>
      <TouchableOpacity style={styles.logoutBtn} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  note: { fontSize: 16, color: '#666', marginBottom: 24 },
  logoutBtn: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 12, alignItems: 'center' },
  logoutText: { color: '#b91c1c', fontSize: 17, fontWeight: 'bold' },
});