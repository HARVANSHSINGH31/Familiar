import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// ⚠️ DEMO DATA: replaced by live data from the hub later
const demo = {
  person: 'Dad',
  room: 'bedroom',
  lastChecked: '2 min ago',
  brooch: { worn: true, battery: 82 },
  hub: { online: true },
  tonight: { getUps: 2, returnedToBed: 2 },
  events: [
    { time: '1:42 AM', text: 'Got up, back in bed after 4 min', type: 'ok' },
    { time: '11:58 PM', text: 'Got up, back in bed after 6 min', type: 'ok' },
    { time: '10:15 PM', text: 'Brooch put on', type: 'info' },
  ],
};

export default function App() {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <Text style={styles.brand}>Familiar</Text>
        <Text style={styles.subtitle}>{demo.person}'s room</Text>

        {/* Big status */}
        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <Text style={styles.statusTitle}>
            {demo.person} is in his {demo.room}
          </Text>
          <Text style={styles.statusSub}>Safe · checked {demo.lastChecked}</Text>
        </View>

        {/* Devices */}
        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>BROOCH</Text>
            <Text style={styles.cardValue}>
              {demo.brooch.worn ? 'Worn ✓' : 'Not worn'}
            </Text>
            <Text style={styles.cardSub}>Battery {demo.brooch.battery}%</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>HUB</Text>
            <Text style={styles.cardValue}>
              {demo.hub.online ? 'Online ✓' : 'Offline'}
            </Text>
            <Text style={styles.cardSub}>Bedside</Text>
          </View>
        </View>

        {/* Tonight */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TONIGHT</Text>
          <Text style={styles.cardValue}>
            Got up {demo.tonight.getUps} times
          </Text>
          <Text style={styles.cardSub}>
            Back in bed {demo.tonight.returnedToBed} of {demo.tonight.getUps} times
          </Text>
        </View>

        {/* Recent activity */}
        <Text style={styles.sectionTitle}>Recent activity</Text>
        {demo.events.map((e, i) => (
          <View key={i} style={styles.event}>
            <View
              style={[
                styles.eventDot,
                { backgroundColor: e.type === 'ok' ? colors.green : colors.muted },
              ]}
            />
            <Text style={styles.eventTime}>{e.time}</Text>
            <Text style={styles.eventText}>{e.text}</Text>
          </View>
        ))}

        <Text style={styles.demoNote}>
          Demo data · live hub connection coming next
        </Text>
      </ScrollView>
    </View>
  );
}

const colors = {
  bg: '#0F1720',
  card: '#18222D',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  green: '#34D399',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  brand: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 2, marginBottom: 20 },

  statusCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1F3B33',
  },
  statusDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.green, marginBottom: 14,
  },
  statusTitle: { color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  statusSub: { color: colors.green, fontSize: 15, marginTop: 6 },

  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  half: { flex: 1, marginBottom: 0 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardLabel: { color: colors.muted, fontSize: 12, letterSpacing: 1.2, marginBottom: 6 },
  cardValue: { color: colors.text, fontSize: 18, fontWeight: '600' },
  cardSub: { color: colors.muted, fontSize: 14, marginTop: 4 },

  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginTop: 10, marginBottom: 10 },
  event: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  eventTime: { color: colors.muted, fontSize: 14, width: 75 },
  eventText: { color: colors.text, fontSize: 15, flex: 1 },

  demoNote: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 24 },
});