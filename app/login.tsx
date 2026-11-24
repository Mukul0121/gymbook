import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { cleanPhoneNumber } from '../lib/phone';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [phoneInput, setPhoneInput] = useState('');
  const [cleanedPhone, setCleanedPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    setError(null);
    const formatted = cleanPhoneNumber(phoneInput);
    if (!formatted) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setCleanedPhone(formatted);
      setStep('otp');
    }
  }

  async function handleVerifyCode() {
    setError(null);
    if (otp.trim().length < 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: cleanedPhone,
      token: otp.trim(),
      type: 'sms',
    });
    setLoading(false);

    if (error) {
      setError(error.message);
    }
    // On success, _layout.tsx automatically redirects to Gym Setup or Members
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.brand}>GymBook</Text>

      {step === 'phone' ? (
        <View style={styles.card}>
          <Text style={styles.label}>Your mobile number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.prefix}>+91</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="98765 43210"
              keyboardType="phone-pad"
              value={phoneInput}
              onChangeText={setPhoneInput}
              editable={!loading}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send code</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.label}>Enter 6-digit code sent to {cleanedPhone}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={setOtp}
            editable={!loading}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log in</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setStep('phone');
              setOtp('');
              setError(null);
            }}
          >
            <Text style={styles.linkText}>Change mobile number</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  brand: { fontSize: 36, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#111' },
  card: { width: '100%' },
  label: { fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222' },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  prefix: { fontSize: 20, fontWeight: '600', color: '#333', marginRight: 8 },
  phoneInput: { flex: 1, fontSize: 20, paddingVertical: 14, color: '#111' },
  input: {
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 14,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 16,
    color: '#111',
  },
  button: {
    backgroundColor: '#111',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  error: { color: '#d32f2f', fontSize: 15, marginBottom: 12 },
  linkButton: { marginTop: 20, alignItems: 'center' },
  linkText: { fontSize: 16, color: '#555', textDecorationLine: 'underline' },
});