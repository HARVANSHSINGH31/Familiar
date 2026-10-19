import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert, Pressable, ScrollView, StyleSheet, Text, Vibration, View,
} from 'react-native';

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

const nowTime = () =>
  new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export default function App() {
  const [screen, setScreen] = useState('home');
  const [events, setEvents] = useState(demo.events);
  const [alertTime, setAlertTime] = useState(null);

  const startAlert = () => {
    setAlertTime(nowTime());
    setScreen('alert');
  };

  const handled = (response) => {
    setEvents([
      { time: alertTime, text: `Left the bedroom · ${response}`, type: 'alert' },
      ...events,
    ]);
    setScreen('home');
  };

  return screen === 'alert' ? (
    <AlertScreen time={alertTime} onHandled={handled} />
  ) : (
    <HomeScreen events={events} onSimulate={startAlert} />
  );
}

/* ---------------- HOME ---------------- */
function HomeScreen({ events, onSimulate }) {
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>Familiar</Text>
        <Text style={styles.subtitle}>{demo.person}'s room</Text>

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <Text style={styles.statusTitle}>
            {demo.person} is in his {demo.room}
          </Text>
          <Text style={styles.statusSub}>Safe · checked {demo.lastChecked}</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>BROOCH</Text>
            <Text style={styles.cardValue}>{demo.brooch.worn ? 'Worn ✓' : 'Not worn'}</Text>
            <Text style={styles.cardSub}>Battery {demo.brooch.battery}%</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>HUB</Text>
            <Text style={styles.cardValue}>{demo.hub.online ? 'Online ✓' : 'Offline'}</Text>
            <Text style={styles.cardSub}>Bedside</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>TONIGHT</Text>
          <Text style={styles.cardValue}>Got up {demo.tonight.getUps} times</Text>
          <Text style={styles.cardSub}>
            Back in bed {demo.tonight.returnedToBed} of {demo.tonight.getUps} times
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Recent activity</Text>
        {events.map((e, i) => (
          <View key={i} style={styles.event}>
            <View
              style={[
                styles.eventDot,
                {
                  backgroundColor:
                    e.type === 'alert' ? colors.red : e.type === 'ok' ? colors.green : colors.muted,
                },
              ]}
            />
            <Text style={styles.eventTime}>{e.time}</Text>
            <Text style={styles.eventText}>{e.text}</Text>
          </View>
        ))}

        <Pressable style={styles.simButton} onPress={onSimulate}>
          <Text style={styles.simText}>Simulate alert (demo)</Text>
        </Pressable>

        <Text style={styles.demoNote}>Demo data · live hub connection coming next</Text>
      </ScrollView>
    </View>
  );
}

/* ---------------- ALERT ---------------- */
function AlertScreen({ time, onHandled }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    Vibration.vibrate([0, 600, 400], true); // repeat like an alarm
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      Vibration.cancel();
      clearInterval(timer);
    };
  }, []);

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  const demoPopup = (title, msg) => Alert.alert(`${title} (demo)`, msg);

  return (
    <View style={[styles.screen, styles.alertScreen]}>
      <StatusBar style="light" />
      <View style={styles.alertTop}>
        <Text style={styles.alertEmoji}>🚨</Text>
        <Text style={styles.alertTitle}>{demo.person} left the bedroom</Text>
        <Text style={styles.alertTime}>at {time}</Text>
        <Text style={styles.alertTimer}>{mm}:{ss}</Text>
        <Text style={styles.alertTimerLabel}>since he left</Text>
        <Text style={styles.alertDetail}>Brooch moving · last seen near bedroom door</Text>
      </View>

      <View style={styles.alertButtons}>
        <Pressable
          style={[styles.btn, styles.btnPrimary]}
          onPress={() =>
            demoPopup(
              'Play your voice',
              "In the real product, the hub plays the message you recorded, in your voice, e.g. \"Dad, it's still night. Let's go back to bed.\""
            )
          }
        >
          <Text style={styles.btnPrimaryText}>🔊 Play my voice to {demo.person}</Text>
        </Pressable>

        <Pressable style={styles.btn} onPress={() => onHandled('You went to check')}>
          <Text style={styles.btnText}>🚶 I'm going to check</Text>
        </Pressable>

        <Pressable style={styles.btn} onPress={() => onHandled('Marked as false alarm')}>
          <Text style={styles.btnText}>✅ He's okay · false alarm</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnDanger]}
          onPress={() => demoPopup('Call 911', 'Emergency calling is disabled in the demo.')}
        >
          <Text style={styles.btnText}>📞 Call 911</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- STYLES ---------------- */
const colors = {
  bg: '#0F1720',
  card: '#18222D',
  text: '#F3F4F6',
  muted: '#9CA3AF',
  green: '#34D399',
  red: '#F87171',
  alertBg: '#3B0D0D',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  brand: { color: colors.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: colors.muted, fontSize: 15, marginTop: 2, marginBottom: 20 },

  statusCard: {
    backgroundColor: colors.card, borderRadius: 20, padding: 24, alignItems: 'center',
    marginBottom: 14, borderWidth: 1, borderColor: '#1F3B33',
  },
  statusDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.green, marginBottom: 14 },
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

  simButton: {
    marginTop: 24, borderWidth: 1, borderColor: colors.red, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  simText: { color: colors.red, fontSize: 15, fontWeight: '600' },
  demoNote: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 16 },

  alertScreen: { backgroundColor: colors.alertBg, padding: 20, paddingTop: 70, justifyContent: 'space-between' },
  alertTop: { alignItems: 'center' },
  alertEmoji: { fontSize: 56, marginBottom: 10 },
  alertTitle: { color: '#FFFFFF', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  alertTime: { color: '#FECACA', fontSize: 16, marginTop: 6 },
  alertTimer: { color: '#FFFFFF', fontSize: 56, fontWeight: '800', marginTop: 24 },
  alertTimerLabel: { color: '#FECACA', fontSize: 14 },
  alertDetail: { color: '#FECACA', fontSize: 15, marginTop: 18, textAlign: 'center' },

  alertButtons: { gap: 12, paddingBottom: 30 },
  btn: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingVertical: 18,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  btnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  btnPrimary: { backgroundColor: '#FFFFFF' },
  btnPrimaryText: { color: colors.alertBg, fontSize: 17, fontWeight: '800' },
  btnDanger: { borderColor: colors.red },
});