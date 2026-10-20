import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Alert, Animated, Pressable, ScrollView, StyleSheet, Text, Vibration, View,
} from 'react-native';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { brand, colors, fonts } from './theme';

// ⚠️ DEMO DATA: replaced by live data from the hub later
const demo = {
  person: 'Dad',
  caregiver: 'Harvansh',
  brooch: { worn: true, battery: 82 },
  hub: { online: true },
  events: [
    { time: '1:42 AM', text: 'Got up, back in bed after 4 min', type: 'ok' },
    { time: '11:58 PM', text: 'Got up, back in bed after 6 min', type: 'ok' },
    { time: '10:15 PM', text: 'Brooch put on for the night', type: 'info' },
  ],
};

const nowTime = () =>
  new Date()
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    .replace(/am|pm/i, (m) => m.toUpperCase());

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return `Still up, ${demo.caregiver}?`;
  if (h < 12) return `Good morning, ${demo.caregiver}`;
  if (h < 17) return `Good afternoon, ${demo.caregiver}`;
  if (h < 21) return `Good evening, ${demo.caregiver}`;
  return `Good night, ${demo.caregiver}`;
};

const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

export default function App() {
  const [loaded] = useFonts({
    CormorantGaramond_500Medium,
    CormorantGaramond_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const [screen, setScreen] = useState('home');
  const [events, setEvents] = useState(demo.events);
  const [alertTime, setAlertTime] = useState(null);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const startAlert = () => {
    setAlertTime(nowTime());
    setScreen('alert');
  };

  const handled = (response) => {
    tap();
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

/* ---------- small pieces ---------- */
function BreathingDot({ color, size = 12 }) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 1600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity }}
    />
  );
}

function Wordmark() {
  return (
    <View style={styles.wordmark}>
      <View style={styles.ring}><View style={styles.ringDot} /></View>
      <Text style={styles.wordmarkText}>{brand}</Text>
    </View>
  );
}

/* ---------- HOME ---------- */
function HomeScreen({ events, onSimulate }) {
  const getUps = events.filter((e) => e.type !== 'info').length;
  const lastQuiet = events.find((e) => e.type !== 'info')?.time ?? 'bedtime';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Wordmark />
          <View style={styles.avatar}><Text style={styles.avatarText}>D</Text></View>
        </View>

        <Text style={styles.eyebrow}>{greeting()}</Text>
        <Text style={styles.headline}>
          <Text style={styles.headlineGold}>{demo.person}</Text>'s settled in{'\n'}for the night.
        </Text>

        {/* Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <BreathingDot color={colors.safe} />
            <Text style={styles.statusTitle}>In his bedroom</Text>
          </View>
          <Text style={styles.statusSub}>All quiet since {lastQuiet}</Text>
        </View>

        {/* Devices */}
        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Feather name="circle" size={18} color={colors.gold} />
            <Text style={styles.cardLabel}>BROOCH</Text>
            <Text style={styles.cardValue}>{demo.brooch.worn ? 'Worn' : 'Not worn'}</Text>
            <Text style={styles.cardSub}>{demo.brooch.battery}% battery</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Feather name="radio" size={18} color={colors.gold} />
            <Text style={styles.cardLabel}>HUB</Text>
            <Text style={styles.cardValue}>{demo.hub.online ? 'Online' : 'Offline'}</Text>
            <Text style={styles.cardSub}>At the bedside</Text>
          </View>
        </View>

        {/* Tonight */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>TONIGHT</Text>
          <Text style={styles.tonightTitle}>
            {getUps === 0 ? 'Slept through so far' : `Up ${getUps === 1 ? 'once' : getUps === 2 ? 'twice' : `${getUps} times`}`}
          </Text>
          <Text style={styles.cardSub}>Every time is saved below</Text>
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>The night so far</Text>
        <View style={styles.timeline}>
          {events.map((e, i) => (
            <View key={i} style={styles.tlRow}>
              <Text style={styles.tlTime}>{e.time}</Text>
              <View style={styles.tlRail}>
                <View
                  style={[
                    styles.tlDot,
                    {
                      backgroundColor:
                        e.type === 'alert' ? colors.alert : e.type === 'ok' ? colors.safe : colors.muted,
                    },
                  ]}
                />
                {i < events.length - 1 && <View style={styles.tlLine} />}
              </View>
              <Text style={styles.tlText}>{e.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.simButton, pressed && { opacity: 0.6 }]}
          onPress={() => { tap(); onSimulate(); }}
        >
          <Feather name="bell" size={16} color={colors.alert} />
          <Text style={styles.simText}>Simulate a night alert</Text>
        </Pressable>

        <Text style={styles.demoNote}>Demo data · live hub connection coming next</Text>
      </ScrollView>
    </View>
  );
}

/* ---------- ALERT ---------- */
function AlertScreen({ time, onHandled }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    Vibration.vibrate([0, 600, 400], true);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { Vibration.cancel(); clearInterval(timer); };
  }, []);

  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  const demoPopup = (title, msg) => { tap(); Alert.alert(`${title} (demo)`, msg); };

  return (
    <View style={[styles.screen, styles.alertScreen]}>
      <StatusBar style="light" />
      <View style={styles.alertTop}>
        <BreathingDot color={colors.alert} size={16} />
        <Text style={styles.alertTitle}>{demo.person} left{'\n'}the bedroom</Text>
        <Text style={styles.alertTime}>at {time}</Text>
        <Text style={styles.alertTimer}>{mm}:{ss}</Text>
        <Text style={styles.alertSmall}>since he left</Text>
        <Text style={styles.alertDetail}>Brooch moving, near the bedroom door</Text>
      </View>

      <View style={styles.alertButtons}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.8 }]}
          onPress={() =>
            demoPopup(
              'Play your voice',
              "In the real product, the hub plays the message you recorded, in your voice: \"Dad, it's still night. Let's go back to bed.\""
            )
          }
        >
          <Feather name="volume-2" size={18} color={colors.alertBg} />
          <Text style={styles.btnPrimaryText}>Play my voice to {demo.person}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          onPress={() => onHandled('you went to check')}
        >
          <Feather name="navigation" size={17} color={colors.ink} />
          <Text style={styles.btnText}>I'm going to check</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
          onPress={() => onHandled('marked as false alarm')}
        >
          <Feather name="check" size={17} color={colors.ink} />
          <Text style={styles.btnText}>He's okay, false alarm</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.6 }]}
          onPress={() => demoPopup('Call 911', 'Emergency calling is disabled in the demo.')}
        >
          <Feather name="phone" size={17} color={colors.alert} />
          <Text style={[styles.btnText, { color: colors.alert }]}>Call 911</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- STYLES ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingTop: 62, paddingBottom: 48 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 36 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ring: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  ringDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  wordmarkText: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 15, letterSpacing: 3 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  avatarText: { fontFamily: fonts.serif, color: colors.gold, fontSize: 20 },

  eyebrow: {
    fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10,
  },
  headline: { fontFamily: fonts.serif, color: colors.ink, fontSize: 38, lineHeight: 42, marginBottom: 28 },
  headlineGold: { fontFamily: fonts.serifItalic, color: colors.gold },

  statusCard: {
    backgroundColor: colors.surface, borderRadius: 22, padding: 22, marginBottom: 12,
    borderWidth: 1, borderColor: colors.goldBorder,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTitle: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 19 },
  statusSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, marginTop: 8, marginLeft: 24 },

  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  half: { flex: 1, marginBottom: 0 },
  card: {
    backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  cardLabel: {
    fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11,
    letterSpacing: 1.6, marginTop: 14, marginBottom: 4,
  },
  cardValue: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 17 },
  cardSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, marginTop: 3 },
  tonightTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 28, marginTop: 2 },

  sectionTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 26, marginTop: 22, marginBottom: 14 },
  timeline: { marginBottom: 8 },
  tlRow: { flexDirection: 'row', minHeight: 54 },
  tlTime: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, width: 72, paddingTop: 1 },
  tlRail: { width: 22, alignItems: 'center' },
  tlDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  tlLine: { flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 },
  tlText: { fontFamily: fonts.sans, color: colors.ink, fontSize: 15, flex: 1, lineHeight: 21, paddingLeft: 6 },

  simButton: {
    marginTop: 18, borderWidth: 1, borderColor: 'rgba(200,85,61,0.45)', borderRadius: 999,
    paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  simText: { fontFamily: fonts.sansMedium, color: colors.alert, fontSize: 15 },
  demoNote: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 16 },

  alertScreen: { backgroundColor: colors.alertBg, padding: 22, paddingTop: 80, justifyContent: 'space-between' },
  alertTop: { alignItems: 'center' },
  alertTitle: {
    fontFamily: fonts.serif, color: colors.ink, fontSize: 42, lineHeight: 44,
    textAlign: 'center', marginTop: 22,
  },
  alertTime: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 15, marginTop: 10 },
  alertTimer: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 64, marginTop: 30, letterSpacing: -1 },
  alertSmall: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 13 },
  alertDetail: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 14, marginTop: 20, textAlign: 'center' },

  alertButtons: { gap: 12, paddingBottom: 34 },
  btn: {
    borderRadius: 18, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  btnText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 16 },
  btnPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  btnPrimaryText: { fontFamily: fonts.sansSemi, color: colors.alertBg, fontSize: 16 },
  btnDanger: { borderColor: 'rgba(200,85,61,0.55)' },
});