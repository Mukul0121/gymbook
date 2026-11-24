import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function TabOneScreen() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkConnection() {
      const { data, error } = await supabase
        .from('connection_test')
        .select('message')
        .limit(1)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setMessage(data.message);
      }
    }
    checkConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GymBook</Text>
      {!message && !error && <ActivityIndicator size="large" />}
      {message && <Text style={styles.success}>{message}</Text>}
      {error && <Text style={styles.error}>Error: {error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  success: { fontSize: 18, color: 'green', textAlign: 'center' },
  error: { fontSize: 16, color: 'red', textAlign: 'center' },
});