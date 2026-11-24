import { Session } from '@supabase/supabase-js';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [hasGym, setHasGym] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  async function checkGym(userId: string) {
    const { data } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', userId)
      .limit(1);
    const exists = Boolean(data && data.length > 0);
    setHasGym(exists);
    return exists;
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) await checkGym(session.user.id);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        await checkGym(session.user.id);
      } else {
        setHasGym(null);
      }
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const current = segments[0];

    async function routeUser() {
      if (!session) {
        if (current !== 'login') router.replace('/login');
        return;
      }

      if (hasGym === false) {
        // Re-check in case the user just finished Gym Setup
        const exists = await checkGym(session.user.id);
        if (!exists && current !== 'gym-setup') {
          router.replace('/gym-setup');
        }
        return;
      }

      if (hasGym === true && (current === 'login' || current === 'gym-setup')) {
        router.replace('/(tabs)');
      }
    }

    routeUser();
  }, [ready, session, hasGym, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#111" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="gym-setup" />
    </Stack>
  );
}