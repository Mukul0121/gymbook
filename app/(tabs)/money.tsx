import { StyleSheet, Text, View } from 'react-native';

export default function MoneyScreen() {
  return (
    <View style={styles.center}>
      <Text style={styles.text}>Money tab — coming in Milestone 4</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { fontSize: 16, color: '#666' },
});