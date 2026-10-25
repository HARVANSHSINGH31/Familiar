import { useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
    Alert, Animated, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, Vibration, View,
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
import * as Speech from 'expo-speech';
import { brand, colors, fonts } from './theme';
import { supabase } from './supabase';

// ⚠️ DEMO DATA: replaced by live data from the hub later
const demo = {
  person: 'Dad',
  caregiver: 'Harvansh',
  brooch: { worn: true, battery: 82, lastSeen: 'just now' },
  hub: { online: true, wifi: 'Home WiFi', lastSetup: '18 Oct' },
  events: [
    { time: '1:42 AM', text: 'Got up, back in bed after 4 min', type: 'ok' },
    { time: '11:58 PM', text: 'Got up, back in bed after 6 min', type: 'ok' },
    { time: '10:15 PM', text: 'Brooch put on for the night', type: 'info' },
  ],
};

const TABS = [
  { key: 'tonight', label: 'Tonight', icon: 'moon' },
  { key: 'history', label: 'History', icon: 'calendar' },
  { key: 'voice', label: 'Voice', icon: 'mic', center: true },
  { key: 'family', label: 'Family', icon: 'users' },
  { key: 'devices', label: 'Devices', icon: 'radio' },
];

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
    const [tab, setTab] = useState('tonight');
  const [alerting, setAlerting] = useState(false);
  const [events, setEvents] = useState(demo.events);
  const [alertTime, setAlertTime] = useState(null);
  const [alertId, setAlertId] = useState(null);

  const fmt = (iso) =>
    new Date(iso)
      .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      .replace(/am|pm/i, (m) => m.toUpperCase());

  // Listen live for new events from the hub (or the dashboard)
  useEffect(() => {
    const channel = supabase
      .channel('events-demo')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: 'household=eq.demo' },
        (payload) => {
          const row = payload.new;
          if (row.type === 'left_room') {
            setAlertId(row.id);
            setAlertTime(fmt(row.created_at));
            setAlerting(true);
          }
        }
      )
      .subscribe((status) => console.log('ARERA realtime:', status));
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  // The test button now writes a REAL row; the listener above shows the alert
  const startAlert = async () => {
    const { error } = await supabase
      .from('events')
      .insert({ type: 'left_room', detail: 'test from the app' });
    if (error) Alert.alert('Could not reach ARERA', error.message);
  };

  const handled = (response) => {
    tap();
    if (alertId) {
      supabase
        .from('events')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', alertId)
        .then(({ error }) => error && console.log('respond error:', error.message));
    }
    setEvents([
      { time: alertTime, text: `Left the bedroom · ${response}`, type: 'alert' },
      ...events,
    ]);
    setAlertId(null);
    setAlerting(false);
    setTab('tonight');
  };

  if (alerting) return <AlertScreen time={alertTime} onHandled={handled} />;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={{ flex: 1 }}>
        {tab === 'tonight' && <TonightScreen events={events} onSimulate={startAlert} />}
        {tab === 'devices' && <DevicesScreen />}
        {tab === 'history' && (
          <ComingScreen
            icon="calendar"
            title="Every night,"
            italic="remembered."
            text="See patterns over weeks: how often Dad gets up, and when. The kind of thing his doctor will ask about."
          />
        )}
        {tab === 'voice' && (
          <ComingScreen
            icon="mic"
            title="Your voice,"
            italic="at his bedside."
            text="Record a few short messages. When Dad gets up at night, the hub can play one, in your voice."
          />
        )}
                {tab === 'family' && <FamilyScreen />}
      </View>
      <TabBar active={tab} onChange={(k) => { tap(); setTab(k); }} />
    </View>
  );
}

/* ---------- shared pieces ---------- */
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

function Header() {
  return (
    <View style={styles.topRow}>
      <View style={styles.wordmark}>
        <View style={styles.ring}><View style={styles.ringDot} /></View>
        <Text style={styles.wordmarkText}>{brand}</Text>
      </View>
      <View style={styles.avatar}><Text style={styles.avatarText}>D</Text></View>
    </View>
  );
}

function TabBar({ active, onChange }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const on = active === t.key;
        if (t.center) {
          return (
            <Pressable key={t.key} style={styles.tabItem} onPress={() => onChange(t.key)}>
              <View style={[styles.centerBtn, on && styles.centerBtnOn]}>
                <Feather name={t.icon} size={22} color={colors.onGold} />
              </View>
            </Pressable>
          );
        }
        return (
          <Pressable key={t.key} style={styles.tabItem} onPress={() => onChange(t.key)}>
            <Feather name={t.icon} size={21} color={on ? colors.gold : colors.muted} />
            <Text style={[styles.tabLabel, on && { color: colors.gold }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- TONIGHT ---------- */
function TonightScreen({ events, onSimulate }) {
  const getUps = events.filter((e) => e.type !== 'info').length;
  const lastQuiet = events.find((e) => e.type !== 'info')?.time ?? 'bedtime';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <Text style={styles.eyebrow}>{greeting()}</Text>
      <Text style={styles.headline}>
        <Text style={styles.headlineGold}>{demo.person}</Text>'s settled in{'\n'}for the night.
      </Text>

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <BreathingDot color={colors.safe} />
          <Text style={styles.statusTitle}>In his bedroom</Text>
        </View>
        <Text style={styles.statusSub}>All quiet since {lastQuiet}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>TONIGHT</Text>
        <Text style={styles.tonightTitle}>
          {getUps === 0 ? 'Slept through so far'
            : `Up ${getUps === 1 ? 'once' : getUps === 2 ? 'twice' : `${getUps} times`}`}
        </Text>
        <Text style={styles.cardSub}>Every time is saved below</Text>
      </View>

      <Text style={styles.sectionTitle}>The night so far</Text>
      {events.map((e, i) => (
        <View key={i} style={styles.tlRow}>
          <Text style={styles.tlTime}>{e.time}</Text>
          <View style={styles.tlRail}>
            <View
              style={[
                styles.tlDot,
                { backgroundColor: e.type === 'alert' ? colors.alert : e.type === 'ok' ? colors.safe : colors.muted },
              ]}
            />
            {i < events.length - 1 && <View style={styles.tlLine} />}
          </View>
          <Text style={styles.tlText}>{e.text}</Text>
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.simButton, pressed && { opacity: 0.6 }]}
        onPress={() => { tap(); onSimulate(); }}
      >
        <Feather name="bell" size={16} color={colors.alert} />
        <Text style={styles.simText}>Simulate a night alert</Text>
      </Pressable>
      <Text style={styles.demoNote}>Demo data · live hub connection coming next</Text>
    </ScrollView>
  );
}

/* ---------- DEVICES ---------- */
function DevicesScreen() {
  const b = demo.brooch;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <Text style={styles.eyebrow}>Devices</Text>
      <Text style={styles.headline}>
        Everything's <Text style={styles.headlineGold}>working.</Text>
      </Text>

      <View style={styles.card}>
        <View style={styles.devTop}>
          <Feather name="circle" size={20} color={colors.gold} />
          <View style={styles.pill}><BreathingDot color={colors.safe} size={7} /><Text style={styles.pillText}>Worn</Text></View>
        </View>
        <Text style={styles.devName}>Brooch</Text>
        <Text style={styles.cardSub}>Last heard from {b.lastSeen}</Text>
        <View style={styles.battTrack}>
          <View style={[styles.battFill, { width: `${b.battery}%` }]} />
        </View>
        <Text style={styles.cardSub}>{b.battery}% · charges on the hub each morning</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.devTop}>
          <Feather name="radio" size={20} color={colors.gold} />
          <View style={styles.pill}><BreathingDot color={colors.safe} size={7} /><Text style={styles.pillText}>Online</Text></View>
        </View>
        <Text style={styles.devName}>Bedside hub</Text>
        <Text style={styles.cardSub}>Connected to {demo.hub.wifi}</Text>
        <Text style={styles.cardSub}>Room learned on {demo.hub.lastSetup}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.goldBtn, pressed && { opacity: 0.8 }]}
        onPress={() => {
          tap();
          Alert.alert(
            'Room setup walk (demo)',
            "In the real product, you walk slowly around Dad's room with the brooch so the hub learns where 'inside' ends."
          );
        }}
      >
        <Feather name="refresh-cw" size={16} color={colors.onGold} />
        <Text style={styles.goldBtnText}>Re-learn the room</Text>
      </Pressable>
      <Text style={styles.demoNote}>Demo data · live device status coming next</Text>
    </ScrollView>
  );
}
/* ---------- FAMILY ---------- */
function FamilyScreen() {
  const [reminders, setReminders] = useState([
    { id: 1, time: '8:00 AM', label: 'Morning tablets', kind: 'pill', on: true },
    { id: 2, time: '2:00 PM', label: 'A glass of water', kind: 'water', on: true },
    { id: 3, time: '9:00 PM', label: 'Night tablets', kind: 'pill', on: true },
    { id: 4, time: 'Thu 11:00 AM', label: 'Doctor visit', kind: 'doctor', on: false },
  ]);
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const icons = { pill: 'plus-square', water: 'droplet', doctor: 'activity', other: 'bell' };

  const toggle = (id) => {
    tap();
    setReminders(reminders.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
  };
  const remove = (id) => {
    Alert.alert('Remove reminder?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setReminders(reminders.filter((r) => r.id !== id)) },
    ]);
  };
  const add = () => {
    if (!newTime.trim() || !newLabel.trim()) return;
    tap();
    setReminders([...reminders, { id: Date.now(), time: newTime.trim(), label: newLabel.trim(), kind: 'other', on: true }]);
    setNewTime(''); setNewLabel(''); setAdding(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header />
      <Text style={styles.eyebrow}>Family</Text>
      <Text style={styles.headline}>
        {demo.person}'s day,{'\n'}<Text style={styles.headlineGold}>gently kept.</Text>
      </Text>

      <Text style={styles.sectionTitle}>Daily reminders</Text>
      <Text style={[styles.cardSub, { marginTop: -6, marginBottom: 14 }]}>
        Played aloud at the hub, in your recorded voice. Hold a reminder to remove it.
      </Text>

      {reminders.map((r) => (
        <Pressable key={r.id} onLongPress={() => remove(r.id)} style={[styles.remRow, !r.on && { opacity: 0.45 }]}>
          <View style={styles.remIcon}><Feather name={icons[r.kind]} size={17} color={colors.gold} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.remLabel}>{r.label}</Text>
            <Text style={styles.cardSub}>{r.time}</Text>
          </View>
          <Switch
            value={r.on}
            onValueChange={() => toggle(r.id)}
            trackColor={{ false: colors.surfaceRaised, true: colors.goldBorder }}
            thumbColor={r.on ? colors.gold : colors.muted}
          />
        </Pressable>
      ))}

      {adding ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT</Text>
          <TextInput
            value={newLabel} onChangeText={setNewLabel}
            placeholder="e.g. Evening walk" placeholderTextColor={colors.muted} style={styles.input}
          />
          <Text style={[styles.cardLabel, { marginTop: 12 }]}>WHEN</Text>
          <TextInput
            value={newTime} onChangeText={setNewTime}
            placeholder="e.g. 6:30 PM" placeholderTextColor={colors.muted} style={styles.input}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={[styles.goldBtn, { flex: 1, marginTop: 0 }]} onPress={add}>
              <Text style={styles.goldBtnText}>Save</Text>
            </Pressable>
            <Pressable style={[styles.ghostBtn, { flex: 1 }]} onPress={() => setAdding(false)}>
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.ghostBtn} onPress={() => { tap(); setAdding(true); }}>
          <Feather name="plus" size={16} color={colors.gold} />
          <Text style={[styles.btnText, { color: colors.gold }]}>Add a reminder</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Who gets alerted</Text>
      <View style={styles.card}>
        <View style={styles.personRow}>
          <View style={styles.personAvatar}><Text style={styles.avatarText}>H</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.remLabel}>You</Text>
            <Text style={styles.cardSub}>Alerted first, every night</Text>
          </View>
        </View>
      </View>
      <Pressable
        style={styles.ghostBtn}
        onPress={() => { tap(); Alert.alert('Invite family (demo)', 'Soon you can invite a sibling as a backup: if you don\'t respond in 2 minutes, they get the alert.'); }}
      >
        <Feather name="user-plus" size={16} color={colors.gold} />
        <Text style={[styles.btnText, { color: colors.gold }]}>Add a family member</Text>
      </Pressable>

      <Text style={styles.demoNote}>Reminders are a helping hand, not medical advice.</Text>
    </ScrollView>
  );
}




/* ---------- COMING NEXT ---------- */
function ComingScreen({ icon, title, italic, text }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <View style={styles.comingIcon}><Feather name={icon} size={26} color={colors.gold} /></View>
      <Text style={styles.headline}>
        {title}{'\n'}<Text style={styles.headlineGold}>{italic}</Text>
      </Text>
      <Text style={styles.comingText}>{text}</Text>
      <View style={styles.comingTag}><Text style={styles.comingTagText}>Coming in the next build</Text></View>
    </ScrollView>
  );
}

/* ---------- ALERT ---------- */
function AlertScreen({ time, onHandled }) {
  const [seconds, setSeconds] = useState(0);
    useEffect(() => {
    Vibration.vibrate([0, 600, 400], true);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const say = () => Speech.speak(`${demo.person} has left the bedroom.`, { rate: 0.95 });
    say();
    const voice = setInterval(say, 6000);
    return () => {
      Vibration.cancel();
      clearInterval(timer);
      clearInterval(voice);
      Speech.stop();
    };
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
          onPress={() => demoPopup('Play your voice',
            "In the real product, the hub plays the message you recorded, in your voice: \"Dad, it's still night. Let's go back to bed.\"")}
        >
          <Feather name="volume-2" size={18} color={colors.alertBg} />
          <Text style={styles.btnPrimaryText}>Play my voice to {demo.person}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} onPress={() => onHandled('you went to check')}>
          <Feather name="navigation" size={17} color={colors.ink} />
          <Text style={styles.btnText}>I'm going to check</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} onPress={() => onHandled('marked as false alarm')}>
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
  content: { padding: 22, paddingTop: 62, paddingBottom: 40 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  ringDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gold },
  wordmarkText: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 15, letterSpacing: 3 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  avatarText: { fontFamily: fonts.serif, color: colors.gold, fontSize: 20 },

  eyebrow: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 },
  headline: { fontFamily: fonts.serif, color: colors.ink, fontSize: 38, lineHeight: 42, marginBottom: 26 },
  headlineGold: { fontFamily: fonts.serifItalic, color: colors.gold },

  statusCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 22, marginBottom: 12, borderWidth: 1, borderColor: colors.goldBorder },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTitle: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 19 },
  statusSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, marginTop: 8, marginLeft: 24 },

  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  cardLabel: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11, letterSpacing: 1.6, marginBottom: 4 },
  cardSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, marginTop: 4 },
  tonightTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 28, marginTop: 2 },

  sectionTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 26, marginTop: 20, marginBottom: 14 },
  tlRow: { flexDirection: 'row', minHeight: 54 },
  tlTime: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, width: 72, paddingTop: 1 },
  tlRail: { width: 22, alignItems: 'center' },
  tlDot: { width: 9, height: 9, borderRadius: 5, marginTop: 4 },
  tlLine: { flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 },
  tlText: { fontFamily: fonts.sans, color: colors.ink, fontSize: 15, flex: 1, lineHeight: 21, paddingLeft: 6 },

  simButton: { marginTop: 18, borderWidth: 1, borderColor: 'rgba(200,85,61,0.45)', borderRadius: 999, paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  simText: { fontFamily: fonts.sansMedium, color: colors.alert, fontSize: 15 },
  demoNote: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 16 },

  devTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  devName: { fontFamily: fonts.serif, color: colors.ink, fontSize: 26 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  pillText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 12 },
  battTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, marginTop: 16, marginBottom: 4, overflow: 'hidden' },
  battFill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  goldBtn: { marginTop: 10, backgroundColor: colors.gold, borderRadius: 999, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  goldBtnText: { fontFamily: fonts.sansSemi, color: colors.onGold, fontSize: 15 },

  comingIcon: { width: 60, height: 60, borderRadius: 30, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center', marginBottom: 22, marginTop: 20 },
  comingText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 16, lineHeight: 25 },
  comingTag: { alignSelf: 'flex-start', marginTop: 24, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  comingTagText: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12, letterSpacing: 1 },
  
  remRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  remIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  remLabel: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 16 },
  input: { fontFamily: fonts.sans, color: colors.ink, fontSize: 16, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.bg },
  ghostBtn: { marginTop: 6, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 999, paddingVertical: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  personAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, paddingBottom: 26, alignItems: 'center' },
  tabItem: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11 },
  centerBtn: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: -26, borderWidth: 4, borderColor: colors.bg },
  centerBtnOn: { backgroundColor: colors.goldSoft },

  alertScreen: { backgroundColor: colors.alertBg, padding: 22, paddingTop: 80, justifyContent: 'space-between' },
  alertTop: { alignItems: 'center' },
  alertTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 42, lineHeight: 44, textAlign: 'center', marginTop: 22 },
  alertTime: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 15, marginTop: 10 },
  alertTimer: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 64, marginTop: 30, letterSpacing: -1 },
  alertSmall: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 13 },
  alertDetail: { fontFamily: fonts.sans, color: '#E5B8AC', fontSize: 14, marginTop: 20, textAlign: 'center' },
  alertButtons: { gap: 12, paddingBottom: 34 },
  btn: { borderRadius: 18, paddingVertical: 18, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  btnText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 16 },
  btnPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  btnPrimaryText: { fontFamily: fonts.sansSemi, color: colors.alertBg, fontSize: 16 },
  btnDanger: { borderColor: 'rgba(200,85,61,0.55)' },
});