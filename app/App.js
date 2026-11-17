import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
    Alert, Animated, Image, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, Vibration, View,
} from 'react-native';
import { useFonts } from 'expo-font';
import {
  CormorantGaramond_500Medium,
  CormorantGaramond_500Medium_Italic,
} from '@expo-google-fonts/cormorant-garamond';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useVideoPlayer, VideoView } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
require('react-native').LogBox.ignoreLogs(['[expo-notifications]']);


// expo-audio is native on iOS/Android and MediaRecorder on web. Loaded through a
// guarded require so a platform without it degrades instead of crashing.
let Audio = null;
try { Audio = require('expo-audio'); } catch (e) { Audio = null; }

// Native only. On web there is no push, so this degrades to nothing.
let Notify = null;
try { Notify = require('expo-notifications'); } catch (e) { Notify = null; }
console.log('ARERA notifications loaded:', !!Notify);
// Capturing the frame and writing it to the phone's own gallery.
let MediaLibrary = null;
try { MediaLibrary = require('expo-media-library'); } catch (e) { MediaLibrary = null; }
let captureRef = null;
try { captureRef = require('react-native-view-shot').captureRef; } catch (e) { captureRef = null; }
import { applyTheme, brand, colors, fonts } from './theme';
import { t, setLanguage, LANGUAGES, DICT } from './i18n';
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

// The plan this household is on. isPro drives the badge, the settings row and
// whether the live view offers an upgrade or shows the member state.
const MEMBERSHIP = { isPro: true, plan: 'ARERA Pro+', months: 3 };

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
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });
    const [tab, setTab] = useState('tonight');
  const [alerting, setAlerting] = useState(false);
  const [events, setEvents] = useState(demo.events);
  const [alertTime, setAlertTime] = useState(null);
  const [alertId, setAlertId] = useState(null);
  const [alertKind, setAlertKind] = useState('wake');
  const [visitor, setVisitor] = useState(null);   // brooch camera: someone walked up
  const [liveOpen, setLiveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [lang, setLang] = useState('en');
  const [household, setHousehold] = useState(undefined);
  const [device, setDevice] = useState(null);   // whatever the hub last reported
  const [splash, setSplash] = useState(true);
  const [signedIn, setSignedIn] = useState(null);   // null = checking
  const [skippedAuth, setSkippedAuth] = useState(Platform.OS === 'web');
    useEffect(() => {
    if (!Notify) return;
    Notify.setNotificationChannelAsync('falls', {
      name: 'Fall alerts',
      importance: Notify.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
    }).catch((e) => console.log('channel error:', e.message));
  }, []);

  useEffect(() => {
    (async () => {
      if (!Notify) return;
      try {
        const { status } = await Notify.getPermissionsAsync();
        if (status !== 'granted') await Notify.requestPermissionsAsync();
        Notify.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
          }),
        });
      } catch (e) {}
    })();
  }, []);
  const [sheet, setSheet] = useState(null);
  const [shots, setShots] = useState([]);
  const [membership, setMembership] = useState(MEMBERSHIP);
  const [settings, setSettings] = useState({ alerts: true, sound: true, camera: false });

  // first run: no household yet means onboarding, not somebody else's data
  useEffect(() => {
    (async () => {
      const h = await loadHousehold();
      if (h) {
        Object.assign(demo, {
          person: h.person, caregiver: h.caregiver,
          brooch: { ...demo.brooch, ...h.brooch },
          hub: { ...demo.hub, ...h.hub },
        });
        if (h.events) setEvents(h.events);
      }
      // who is signed in decides which household we are looking at
      try {
        const { data } = await supabase.auth.getSession();
        const session = data && data.session;
        if (session) {
          const { data: rows } = await supabase
            .from('members')
            .select('household')
            .eq('user_id', session.user.id)
            .limit(1);
          if (rows && rows[0]) setHouseholdId(rows[0].household);
          setSignedIn(true);
        } else {
          setSignedIn(false);
        }
      } catch (e) {
        setSignedIn(false);
      }

      setHousehold(h || null);

      // whatever the brooch and hub last published. Nothing is invented here:
      // if they have never reported, the app says so.
      try {
        const { data } = await supabase
          .from('devices')
          .select('battery, worn, online, wifi, firmware, last_seen')
          .eq('household', HOUSEHOLD)
          .order('last_seen', { ascending: false })
          .limit(1);
        if (data && data[0]) {
          setDevice(data[0]);
          Object.assign(demo.brooch, {
            battery: data[0].battery, worn: data[0].worn, paired: true,
          });
          Object.assign(demo.hub, { online: data[0].online, wifi: data[0].wifi });
        }
      } catch (e) {}
      setShots(await readKey('arera.shots.v1', []));
      setMembership(await readKey(MEMBERSHIP_KEY, MEMBERSHIP));
      setSettings(await readKey(SETTINGS_KEY, { alerts: true, sound: true, camera: false }));
      const savedLang = await readKey('arera.lang.v1', 'en');
      if (savedLang && savedLang !== 'en') { setLanguage(savedLang); styles = makeStyles(); }
      setLang(savedLang || 'en');
    })();
  }, []);

  const changeLanguage = async (code) => {
    setLanguage(code);
    styles = makeStyles();
    setLang(code);
    await writeKey('arera.lang.v1', code);
  };

  const updateMembership = async (next) => {
    setMembership(next);
    await writeKey(MEMBERSHIP_KEY, next);
  };

  const updateSettings = async (next) => {
    setSettings(next);
    await writeKey(SETTINGS_KEY, next);
  };

  const takeSnapshot = async () => {
    const next = [{ time: nowTime() }, ...shots].slice(0, 30);
    setShots(next);
    await writeKey('arera.shots.v1', next);
    setSheet('snapshots');
  };

  const shareWeek = async () => {
    const lines = [
      `ARERA · ${demo.person}'s week`,
      `Household: ${demo.caregiver}`,
      '',
      ...events.map((e) => `${e.time}  ${e.text}`),
      '',
      t('Recorded by the ARERA Brooch. A check-in is not proof of safety.'),
    ].join('\n');
    try { await Share.share({ message: lines, title: 'ARERA week summary' }); }
    catch (e) { Alert.alert('Could not share', t('Your device did not offer a share sheet.')); }
  };

  // one tap into a believable household, so a demo never stalls on a text field
  
    // Web build for investors: go straight into the sample household
  useEffect(() => {
    if (Platform.OS === 'web' && household === null) { setHouseholdId('demo'); startDemo(); }
  }, [household]);
    const startDemo = async () => {
    const demoHousehold = {
      person: 'Dad',
      caregiver: 'Harvansh',
      relationship: 'Dad',
      brooch: { id: 'ARERA Brooch · B-1042', paired: true, battery: 82, worn: true },
      hub: { online: true, wifi: 'Home Wi-Fi' },
      photos: 6,
      members: [
        { name: 'Harvansh', role: 'Owner' },
        { name: 'Priya', role: 'Backup' },
      ],
      isDemo: true,
      createdAt: new Date().toISOString(),
    };
    await completeOnboarding(demoHousehold);
  };

  const completeOnboarding = async (h) => {
    Object.assign(demo, {
      person: h.person, caregiver: h.caregiver,
      brooch: { ...demo.brooch, ...h.brooch },
      hub: { ...demo.hub, ...h.hub },
    });
    setHousehold(h);
    await saveHousehold(h);
  };

  const changeTheme = (mode) => {
    applyTheme(mode);
    styles = makeStyles();
    setTheme(mode);
  };

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
                    console.log('ARERA event:', row.type, row.id);
          if (row.type === 'left_room') {
            setAlertId(row.id);
            setAlertTime(fmt(row.created_at));
            setAlerting(true);
          } else if (row.type === 'unknown_person') {
            setVisitor({ id: row.id, photo: row.photo_url, time: fmt(row.created_at) });
                    } else if (row.type === 'fall') {
            const respond = (response) =>
              supabase.from('events')
                .update({ response, responded_at: new Date().toISOString() })
                .eq('id', row.id)
                .then(({ error }) => error && console.log('respond error:', error.message));
                                    Vibration.vibrate([0, 500, 250, 500, 250, 500]);
            Notify && Notify.scheduleNotificationAsync({
              content: {
                title: 'Dad may have fallen',
                body: `${fmt(row.created_at)} · Brooch detected a fall. Tap to open ARERA.`,
                sound: 'default',
                priority: 'max',
              },
              trigger: { channelId: 'falls' },
            });
                Speech.speak('Dad may have fallen. Please check on him now.', { rate: 0.95 });
            Alert.alert(
              'Dad may have fallen',
              `${fmt(row.created_at)} · ${row.detail || 'The brooch detected a fall'}`,
              [
                { text: "He's okay", onPress: () => respond('okay') },
                { text: 'On my way', onPress: () => respond('on_my_way') },
                { text: "I'm calling him", onPress: () => respond('calling') },
              ],
              { cancelable: false }
            );
          }
        }
      )
      .subscribe((status) => console.log('ARERA realtime:', status));
    const deviceChannel = supabase
      .channel('arera-device')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter: 'household=eq.demo' },
        (payload) => {
          const d = payload.new;
          if (!d) return;
          setDevice(d);
          Object.assign(demo.brooch, { battery: d.battery, worn: d.worn, paired: true });
          Object.assign(demo.hub, { online: d.online, wifi: d.wifi });
        })
      .subscribe(() => {});

    return () => { supabase.removeChannel(channel); supabase.removeChannel(deviceChannel); };
  }, []);
    
  if (!loaded || splash) return <Splash onDone={() => setSplash(false)} />;

  if (signedIn === null) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (signedIn === false && !skippedAuth) {
    return (
      <AuthScreen
        onSignedIn={() => setSignedIn(true)}
        onSkip={() => { setHouseholdId('demo'); setSkippedAuth(true); }}
      />
    );
  }
  if (household === undefined) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (household === null) return <Onboarding onDone={completeOnboarding} lang={lang} onLanguage={changeLanguage} onDemo={startDemo} />;

  // The test button now writes a REAL row; the listener above shows the alert
  // Optimistic: show the alert immediately, then tell the server. A demo that
  // depends on a round trip is a demo that stalls in front of an investor.
  const startAlert = async () => {
    tap();
    setAlertKind('wake');
    setAlertTime(nowTime());
    setAlerting(true);
    try {
      await supabase.from('events').insert({ type: 'left_room', detail: 'test from the app', household: HOUSEHOLD });
    } catch (e) {}
  };

  const startFall = async () => {
    tap();
    setAlertKind('fall');
    setAlertTime(nowTime());
    setAlerting(true);
    try {
      await supabase.from('events').insert({ type: 'fall', detail: 'A fall was detected in the bedroom', household: HOUSEHOLD });
    } catch (e) {}
  };

  const handled = (response) => {
    tap();
    if (alertId) {
      supabase
        .from('events')
        .update({ response, responded_at: new Date().toISOString() })
        .eq('id', alertId)
        .then(({ error }) => error);
    }
    setEvents([
      { time: alertTime, text: `Left the bedroom · ${response}`, type: 'alert' },
      ...events,
    ]);
    setAlertId(null);
    setAlerting(false);
    setTab('tonight');
  };

  const answerVisitor = (response) => {
    tap();
    supabase
      .from('events')
      .update({ response, responded_at: new Date().toISOString() })
      .eq('id', visitor.id)
      .then(({ error }) => error);
    setEvents([
      { time: visitor.time, text: `Someone visited · ${response}`, type: response === "I don't know them" ? 'alert' : 'ok' },
      ...events,
    ]);
    setVisitor(null);
    setTab('tonight');
  };

  if (visitor) return <VisitorScreen visitor={visitor} onAnswer={answerVisitor} />;
  if (alerting) return <AlertScreen time={alertTime} kind={alertKind} onHandled={handled} />;

  return (
    <SettingsCtx.Provider value={() => setSettingsOpen(true)}>
    <View style={styles.screen}>
      <StatusBar style={theme === 'light' ? 'dark' : 'light'} />
      <View style={{ flex: 1 }}>
        {tab === 'tonight' && (
          <TonightScreen events={events} onSimulate={startAlert} onSimulateFall={startFall} setLiveOpen={setLiveOpen} membership={membership} onConversations={() => setSheet('conversations')} />
        )}
        {tab === 'devices' && <DevicesScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'voice' && <VoiceScreen household={household} />}
                {tab === 'family' && <FamilyScreen />}
      </View>
      <TabBar active={tab} onChange={(k) => { tap(); setTab(k); }} />

      {liveOpen && (
        <View style={StyleSheet.absoluteFill}>
          <LiveScreen
            onClose={() => setLiveOpen(false)}
            onSettings={() => setSettingsOpen(true)}
            onUpgrade={() => setSheet('plan')}
            onSnapshot={takeSnapshot}
            onPlayback={() => setSheet('playback')}
            onCare={() => setSheet('care')}
            onSay={() => setSheet('say')}
            membership={membership}
          />
        </View>
      )}

      {settingsOpen && (
        <View style={StyleSheet.absoluteFill}>
          <SettingsScreen
            onClose={() => setSettingsOpen(false)}
            theme={theme} onTheme={changeTheme}
            household={household} settings={settings} onSettings={updateSettings}
            membership={membership} onPlan={() => setSheet('plan')}
            lang={lang} onLanguage={changeLanguage}
          />
        </View>
      )}

      {sheet === 'snapshots' && <SnapshotsSheet shots={shots} onClose={() => setSheet(null)} onTake={takeSnapshot} />}
      {sheet === 'playback' && <PlaybackSheet events={events} onClose={() => setSheet(null)} onShare={shareWeek} />}
      {sheet === 'care' && (
        <CareSheet
          household={household}
          onClose={() => setSheet(null)}
          onPlan={() => setSheet('plan')}
          onAddMember={(m) => {
            const next = { ...household, members: [...((household && household.members) || []), m] };
            setHousehold(next); saveHousehold(next);
          }}
          onRemoveMember={(i) => {
            const next = { ...household, members: ((household && household.members) || []).filter((_, k) => k !== i) };
            setHousehold(next); saveHousehold(next);
          }}
        />
      )}
      {sheet === 'conversations' && <ConversationsSheet onClose={() => setSheet(null)} />}
      {sheet === 'say' && <SaySheet onClose={() => setSheet(null)} />}
      {sheet === 'plan' && (
        <PlanSheet
          membership={membership}
          onClose={() => setSheet(null)}
          onSubscribe={() => { updateMembership({ ...membership, isPro: true, months: 3 }); setSheet(null); }}
          onCancel={() => { updateMembership({ ...membership, isPro: false }); setSheet(null); }}
        />
      )}
    </View>
    </SettingsCtx.Provider>
  );
}

/* ---------- shared pieces ---------- */
function GoldSwitch({ value, onChange }) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 170, useNativeDriver: false }).start();
  }, [value, anim]);
  const track = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.surfaceRaised, colors.gold] });
  const left = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });
  return (
    <Pressable
      onPress={() => { tap(); onChange(!value); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={12}
    >
      <Animated.View style={[styles.swTrack, { backgroundColor: track, borderColor: value ? 'transparent' : colors.border }]}>
        <Animated.View style={[styles.swThumb, { left, backgroundColor: value ? colors.onGold : colors.muted }]} />
      </Animated.View>
    </Pressable>
  );
}

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

const SettingsCtx = createContext(() => {});

// A headline whose gold name sits inside a translated sentence. The template
// carries a {{name}} token so any language can place the name where it belongs.
function Headline({ template, name, gold = true }) {
  const parts = t(template).replace(/\\n/g, '\n').split('{{name}}');
  return (
    <Text style={styles.headline}>
      {parts[0]}
      {gold && name ? <Text style={styles.headlineGold}>{name}</Text> : name}
      {parts[1] || ''}
    </Text>
  );
}

function Header() {
  const openSettings = useContext(SettingsCtx);
  return (
    <View style={styles.topRow}>
      <View style={styles.wordmark}>
        <Image source={require('./assets/logo.png')} style={styles.mark} accessibilityLabel={`${brand} logo`} />
        <Text style={styles.wordmarkText}>{brand}</Text>
      </View>
      <Pressable
        onPress={() => { tap(); openSettings(); }}
        style={styles.gearBtn}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={10}
      >
        <Feather name="settings" size={18} color={colors.ink} />
      </Pressable>
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






/* ---------- SIGN IN ---------- */
// A magic link, so a family never has to invent a password. The household id
// comes from the members table, which is what keeps two families apart.
function AuthScreen({ onSignedIn, onSkip }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    tap();
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setError('That does not look like an email address.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: true },
      });
      if (err) { setError(err.message); } else { setSent(true); }
    } catch (e) {
      setError('Could not reach ARERA. Check the connection and try again.');
    }
    setBusy(false);
  };

  return (
    <View style={styles.authRoot}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.obBody} keyboardShouldPersistTaps="handled">
      <View style={{ height: 40 }} />
      <Image source={require('./assets/logo.png')} style={{ width: 62, height: 62, borderRadius: 31, marginBottom: 22 }} />
      <Text style={styles.eyebrow}>ARERA</Text>
      <Text style={styles.headline}>
        {sent ? 'Check your email.' : 'Sign in,\nso the right family\nsees the right person.'}
      </Text>

      {sent ? (
        <>
          <Text style={styles.obSub}>
            We sent a link to {email.trim()}. Open it on this phone and you will come straight back here.
          </Text>
          <Pressable onPress={() => { tap(); setSent(false); }} style={[styles.ghostBtn, { marginTop: 20 }]}>
            <Text style={styles.ghostBtnText}>Use a different email</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.obSub}>
            No password. We send you a link, you tap it, and that is it.
          </Text>
          <Text style={[styles.cardLabel, { marginTop: 22 }]}>YOUR EMAIL</Text>
          <TextInput
            value={email} onChangeText={setEmail}
            placeholder="you@example.com" placeholderTextColor={colors.muted}
            style={styles.obInput} autoCapitalize="none" keyboardType="email-address"
          />
          {error ? <Text style={styles.voiceError}>{error}</Text> : null}
          <Pressable onPress={send} disabled={busy}
            style={[styles.obBtn, { backgroundColor: colors.gold, borderColor: colors.gold, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[styles.obBtnText, { color: colors.onGold }]}>{busy ? 'Sending…' : 'Send me a link'}</Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={() => { tap(); onSkip(); }} style={{ marginTop: 26, paddingVertical: 8 }}>
        <Text style={styles.obSkip}>Look around without an account</Text>
      </Pressable>
      <Text style={styles.obHint}>
        Without an account you will see a sample household, not your own.
      </Text>
    </ScrollView>
    </View>
  );
}

/* ---------- SPLASH ---------- */
// Shown once on open, before anything else. The logo settles in, the line holds,
// then it hands over to onboarding or straight into the app.
function Splash({ onDone }) {
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(14)).current;
  const out = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    ).start();

    const hold = setTimeout(() => {
      Animated.timing(out, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => onDone());
    }, 3600);

    return () => clearTimeout(hold);
  }, []);

  return (
    <Animated.View style={[styles.splashRoot, { opacity: out }]}>
      <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ translateY: rise }] }}>
        <Image source={require('./assets/logo.png')} style={styles.splashLogo} />
        <Text style={styles.splashWord}>ARERA</Text>
        <Text style={styles.splashLine}>Built for the ones, who cared for you first.</Text>
      </Animated.View>

      <Animated.Text style={[styles.splashLoading, { opacity: pulse }]}>
        Loading the best experience for your family
      </Animated.Text>
    </Animated.View>
  );
}

/* ---------- SHEET ---------- */
function Sheet({ title, onClose, children }) {
  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={styles.sheetRoot}>
      <Pressable style={styles.sheetScrim} onPress={() => { tap(); onClose(); }} />
      <View style={styles.sheetCard}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable onPress={() => { tap(); onClose(); }} hitSlop={12} style={styles.setClose}>
            <Feather name="x" size={17} color={colors.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 26 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </View>
    </Modal>
  );
}

/* ---------- FIRST RUN ---------- */
let HOUSEHOLD = 'demo';
const setHouseholdId = (id) => { HOUSEHOLD = id || HOUSEHOLD; };

const STORE_KEY = 'arera.household.v1';

const loadHousehold = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

const saveHousehold = async (h) => {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(h)); } catch (e) {}
};

// small persisted stores, one key each
const readKey = async (k, fallback) => {
  try { const raw = await AsyncStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; }
};
const writeKey = async (k, v) => {
  try { await AsyncStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
};
const SETTINGS_KEY = 'arera.settings.v1';
const REMINDERS_KEY = 'arera.reminders.v1';
const MEMBERSHIP_KEY = 'arera.membership.v1';
const EVENTS_KEY = 'arera.events.v1';

const STEPS = ['Person', 'Brooch', 'Wi-Fi', 'Photos'];

function Onboarding({ onDone, lang, onLanguage, onDemo }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Dad');
  const [me, setMe] = useState('');
  const [scanning, setScanning] = useState(false);
  const [paired, setPaired] = useState(null);
  const [code, setCode] = useState('');
  const [pairError, setPairError] = useState(null);
  const [ssid, setSsid] = useState('');
  const [password, setPassword] = useState('');
  const [photos, setPhotos] = useState(0);

  const canNext =
    (step === 0 && name.trim().length > 0 && me.trim().length > 0) ||
    (step === 1 && paired) ||
    (step === 2 && ssid.trim().length > 0) ||
    step === 3;

  // Real pairing: the six digit code printed inside the brooch. We bind it to
  // this household on the server, and the hub picks it up from there.
  const scan = async () => {
    tap();
    setPairError(null);
    const clean = code.replace(/[^0-9]/g, '');
    if (clean.length !== 6) { setPairError('The code is six digits, printed inside the brooch.'); return; }
    setScanning(true);
    setPaired(null);
    try {
      const { error } = await supabase.from('devices').upsert(
        { household: HOUSEHOLD, pairing_code: clean, name: 'ARERA Brooch', paired_at: new Date().toISOString() },
        { onConflict: 'pairing_code' },
      );
      if (error) {
        setPairError('Could not reach ARERA. Check the connection and try again.');
        setScanning(false);
        return;
      }
      setPaired(`ARERA Brooch · ${clean.slice(-4)}`);
    } catch (e) {
      setPairError('Could not reach ARERA. Check the connection and try again.');
    }
    setScanning(false);
  };

  const addPhotos = async () => {
    tap();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
      if (!res.canceled) setPhotos(photos + res.assets.length);
    } catch (e) {}
  };

  const finish = () => {
    tap();
    onDone({
      person: name.trim(),
      caregiver: me.trim() || 'You',
      relationship,
      brooch: { id: paired || 'ARERA Brooch', paired: Boolean(paired), battery: 100, worn: true },
      hub: { online: true, wifi: ssid.trim() || 'Home Wi-Fi' },
      photos,
      members: [{ name: me.trim() || 'You', role: 'Owner' }],
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <View style={styles.obRoot}>
      <View style={styles.obHead}>
        <Image source={require('./assets/logo.png')} style={styles.obLogo} />
        <Text style={styles.obBrand}>ARERA</Text>
      </View>

      <View style={styles.obLangRow}>
        {LANGUAGES.slice(0, 4).map((l) => (
          <Pressable key={l.code} onPress={() => { tap(); setLanguage(l.code); styles = makeStyles(); onLanguage(l.code); }}
            style={[styles.obLang, lang === l.code && styles.obLangOn]}>
            <Text style={[styles.obLangText, lang === l.code && { color: colors.onGold }]}>{l.label}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => { tap(); onDemo(); }} style={styles.obDemo}>
          <Text style={styles.obDemoText}>Skip · see a demo</Text>
        </Pressable>
      </View>

      <View style={styles.obDots}>
        {STEPS.map((label, i) => (
          <View key={label} style={[styles.obDot, i <= step && { backgroundColor: colors.gold, borderColor: colors.gold }]} />
        ))}
      </View>
      <Text style={styles.obStep}>{`Step ${step + 1} of 4 · ${STEPS[step]}`}</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.obBody}>
        {step === 0 && (
          <>
            <Text style={styles.obTitle}>Who are you{String.fromCharCode(10)}caring for?</Text>
            <Text style={styles.obSub}>{t("The brooch is theirs. You will see their day from here.")}</Text>
            <Text style={styles.obLabel}>{t("Their name")}</Text>
            <TextInput style={styles.obInput} value={name} onChangeText={setName} placeholder={t("Dad")} placeholderTextColor={colors.muted} autoFocus />
            <Text style={styles.obLabel}>{t("Your name")}</Text>
            <TextInput style={styles.obInput} value={me} onChangeText={setMe} placeholder={t("Harvansh")} placeholderTextColor={colors.muted} />
            <Text style={styles.obLabel}>{t("Who they are to you")}</Text>
            <View style={styles.obChips}>
              {['Dad', 'Mum', 'Nana', 'Grandpa', 'Grandma'].map((r) => (
                <Pressable key={r} onPress={() => { tap(); setRelationship(r); }}
                  style={[styles.obChip, relationship === r && styles.obChipOn]}>
                  <Text style={[styles.obChipText, relationship === r && { color: colors.onGold }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.obTitle}>Pair the{String.fromCharCode(10)}brooch.</Text>
            <Text style={styles.obSub}>{t("Type the six digit code printed inside the brooch box. That is what ties it to your account.")}</Text>
            <View style={styles.obScan}>
              {scanning ? <Text style={styles.obScanText}>{t("Looking for your brooch…")}</Text>
                : paired ? <><Feather name="check-circle" size={30} color={colors.safe} /><Text style={styles.obScanText}>{paired}</Text></>
                : <><Feather name="hash" size={30} color={colors.muted} /><Text style={styles.obScanText}>{t("Nothing paired yet")}</Text></>}
            </View>
            <Text style={styles.obLabel}>Pairing code</Text>
            <TextInput
              style={[styles.obInput, { letterSpacing: 6, textAlign: 'center', fontSize: 22 }]}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={6}
            />
            {pairError ? <Text style={styles.voiceError}>{pairError}</Text> : null}
            <Pressable onPress={scan} style={styles.obBtn}>
              <Text style={styles.obBtnText}>{paired ? t('Scan again') : scanning ? 'Pairing…' : 'Pair this brooch'}</Text>
            </Pressable>
            <Text style={styles.obHint}>It is printed on a card inside the brooch box, and again on the back of the brooch itself.</Text>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.obTitle}>Which Wi-Fi{String.fromCharCode(10)}is theirs?</Text>
            <Text style={styles.obSub}>{t("The brooch uses it. It never sends video or sound off the device.")}</Text>
            <Text style={styles.obLabel}>{t("Network name")}</Text>
            <TextInput style={styles.obInput} value={ssid} onChangeText={setSsid} placeholder={t("Home Wi-Fi")} placeholderTextColor={colors.muted} autoCapitalize="none" />
            <Text style={styles.obLabel}>{t("Password")}</Text>
            <TextInput style={styles.obInput} value={password} onChangeText={setPassword} placeholder={t("Optional for now")} placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.obTitle}>Teach it their{String.fromCharCode(10)}face.</Text>
            <Text style={styles.obSub}>{t("Four to six photos of the people they see most. Different angles, ordinary light.")}</Text>
            <View style={styles.obScan}>
              <Feather name="camera" size={30} color={colors.gold} />
              <Text style={styles.obScanText}>{photos === 0 ? t('No photos yet') : `${photos} photo${photos === 1 ? '' : 's'} added`}</Text>
            </View>
            <Pressable onPress={addPhotos} style={styles.obBtn}>
              <Text style={styles.obBtnText}>{photos ? t('Add more') : t('Choose photos')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={styles.obFoot}>
        {step > 0 && (
          <Pressable onPress={() => { tap(); setStep(step - 1); }} style={styles.obBack}>
            <Text style={styles.obBackText}>{t("Back")}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => { tap(); step === 3 ? finish() : setStep(step + 1); }}
          style={[styles.obNext, !canNext && { opacity: 0.35 }]}
          disabled={!canNext}
        >
          <Text style={styles.obNextText}>{step === 3 ? 'Start' : 'Continue'}</Text>
        </Pressable>
      </View>
    </View>
  );
}



/* ---------- SAY IT ON THE BROOCH ---------- */
// The call button is not a phone call. It speaks a sentence out loud on the
// brooch in the family's own voice, which is what the product actually is.
const QUICK_SAYS = [
  'Dinner is ready, come to the table.',
  'I am on my way, ten minutes.',
  'Take your tablets with water.',
  'It is Tuesday, and it is sunny outside.',
];

function SaySheet({ onClose }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = async (line) => {
    tap();
    const body = (line || text).trim();
    if (!body) return;
    setBusy(true);
    let ok = false;
    try {
      const { error } = await supabase.from('messages').insert({
        household: HOUSEHOLD, body, spoken: false, created_at: new Date().toISOString(),
      });
      ok = !error;
    } catch (e) { ok = false; }
    setBusy(false);
    setSent(ok
      ? `Said on the brooch. ${demo.person} will hear it in your voice.`
      : 'Could not reach the brooch. It will send when the hub is back online.');
  };

  return (
    <Sheet title="Say it on the brooch" onClose={onClose}>
      <Text style={styles.sheetBody}>
        It plays out loud, in your recorded voice. Not a phone call, and {demo.person} does not have to pick anything up.
      </Text>

      {sent ? (
        <View style={styles.saySent}>
          <Feather name="check-circle" size={18} color={colors.safe} />
          <Text style={styles.saySentText}>{sent}</Text>
        </View>
      ) : null}

      <Text style={styles.cardLabel}>QUICK</Text>
      {QUICK_SAYS.map((q) => (
        <Pressable key={q} onPress={() => send(q)} style={styles.sayQuick}>
          <Feather name="volume-2" size={15} color={colors.gold} />
          <Text style={styles.sayQuickText}>{q}</Text>
        </Pressable>
      ))}

      <Text style={[styles.cardLabel, { marginTop: 16 }]}>OR TYPE IT</Text>
      <TextInput
        value={text} onChangeText={setText}
        placeholder="Something only you would say" placeholderTextColor={colors.muted}
        style={styles.input} multiline
      />
      <Pressable onPress={() => send()} disabled={busy}
        style={[styles.obBtn, { marginTop: 14, backgroundColor: colors.gold, borderColor: colors.gold, opacity: busy ? 0.5 : 1 }]}>
        <Text style={[styles.obBtnText, { color: colors.onGold }]}>{busy ? 'Sending…' : 'Say it on the brooch'}</Text>
      </Pressable>
    </Sheet>
  );
}

/* ---------- SNAPSHOTS / PLAYBACK / CARE / PLAN ---------- */
function SnapshotsSheet({ shots, onClose, onTake }) {
  return (
    <Sheet title={t("Snapshots")} onClose={onClose}>
      <Text style={styles.sheetBody}>{t("A still from the live view, kept here for you. Only you can see these.")}</Text>
      <Pressable onPress={() => { tap(); onTake(); }} style={[styles.obBtn, { marginBottom: 18 }]}>
        <Text style={styles.obBtnText}>{t("Take a snapshot")}</Text>
      </Pressable>
      {shots.length === 0
        ? <Text style={styles.sheetEmpty}>{t("Nothing saved yet.")}</Text>
        : shots.map((s0, i) => (
            <View key={i} style={styles.sheetRow}>
              <Feather name="image" size={16} color={colors.gold} />
              <Text style={styles.sheetRowText}>{t("Snapshot")}</Text>
              <Text style={styles.sheetRowMeta}>{s0.time}</Text>
            </View>
          ))}
    </Sheet>
  );
}


/* ---------- PLAYBACK & DOWNLOAD ---------- */
// Recording runs on the hub, not the phone, so it keeps going when the family
// is away or the app is closed. These controls are instructions to the hub.
const QUALITIES = ['480p', '720p', '1080p'];

const RECORDINGS = [
  { day: 0, time: '11:42 PM', mins: 38, event: 'Night wake' },
  { day: 0, time: '10:15 PM', mins: 12, event: 'Brooch put on' },
  { day: 1, time: '3:05 AM', mins: 54, event: 'Up twice' },
  { day: 1, time: '9:40 PM', mins: 22, event: 'Bedtime' },
  { day: 2, time: '2:20 AM', mins: 41, event: 'Night wake' },
  { day: 3, time: '1:12 AM', mins: 19, event: 'Night wake' },
  { day: 4, time: '11:58 PM', mins: 33, event: 'Up once' },
  { day: 5, time: '4:30 AM', mins: 27, event: 'Early rise' },
  { day: 6, time: '10:02 PM', mins: 15, event: 'Bedtime' },
];

function PlaybackSheet({ events, onClose, onShare }) {
  const [recording, setRecording] = useState(true);
  const [quality, setQuality] = useState('720p');
  const [day, setDay] = useState(0);
  const [note, setNote] = useState(null);

  useEffect(() => {
    (async () => {
      const saved = await readKey('arera.recording.v1', null);
      if (saved) { setRecording(!!saved.recording); setQuality(saved.quality || '720p'); }
    })();
  }, []);

  const commit = async (next) => {
    await writeKey('arera.recording.v1', next);
    try {
      await supabase.from('devices').upsert(
        { household: HOUSEHOLD, recording: next.recording, quality: next.quality, last_seen: new Date().toISOString() },
        { onConflict: 'pairing_code' },
      );
    } catch (e) {}
  };

  const toggleRecording = () => {
    tap();
    const next = { recording: !recording, quality };
    setRecording(next.recording);
    commit(next);
    setNote(next.recording
      ? 'Recording again. The hub keeps going whether or not this app is open.'
      : 'Recording stopped. Nothing new is being captured.');
  };

  const pickQuality = (q) => {
    tap();
    setQuality(q);
    commit({ recording, quality: q });
    setNote(`Recording at ${q} from now on.`);
  };

  const days = ['6 days ago', '5 days ago', '4 days ago', '3 days ago', '2 days ago', 'Yesterday', 'Today'];
  const dayIndex = (i) => days.length - 1 - i;
  const clips = RECORDINGS.filter((r) => r.day === day);

  const download = async (clip) => {
    tap();
    // The hub holds the file. If it is reachable we hand it over, otherwise we
    // say so rather than pretending a download happened.
    setNote(`${clip.event} · ${clip.mins} min at ${quality}. The hub sends the file when it is reachable.`);
  };

  return (
    <Sheet title={t("Playback & download")} onClose={onClose}>
      {/* recording */}
      <View style={styles.pbCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pbTitle}>{recording ? 'Recording' : 'Not recording'}</Text>
          <Text style={styles.cardSub}>
            {recording
              ? `Running at ${quality}. Keeps going when you close the app.`
              : 'Nothing new is being captured.'}
          </Text>
        </View>
        <GoldSwitch value={recording} onChange={toggleRecording} />
      </View>

      {note ? <Text style={styles.peopleNote}>{note}</Text> : null}

      {/* quality */}
      <Text style={styles.cardLabel}>VIDEO QUALITY</Text>
      <View style={[styles.obChips, { marginBottom: 18 }]}>
        {QUALITIES.map((q) => (
          <Pressable key={q} onPress={() => pickQuality(q)}
            style={[styles.obChip, quality === q && styles.obChipOn]}>
            <Text style={[styles.obChipText, quality === q && { color: colors.onGold }]}>{q}</Text>
          </Pressable>
        ))}
      </View>

      {/* calendar */}
      <Text style={styles.cardLabel}>THE LAST SEVEN DAYS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, paddingRight: 8 }}>
        {days.map((d, i) => {
          const n = RECORDINGS.filter((r) => r.day === dayIndex(i)).length;
          return (
            <Pressable key={d} onPress={() => { tap(); setDay(dayIndex(i)); }}
              style={[styles.pbDay, day === dayIndex(i) && styles.pbDayOn]}>
              <Text style={[styles.pbDayLabel, day === dayIndex(i) && { color: colors.onGold }]}>{d}</Text>
              <Text style={[styles.pbDayCount, day === dayIndex(i) && { color: colors.onGold }]}>
                {n ? `${n} clip${n === 1 ? '' : 's'}` : 'none'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* clips */}
      <View style={{ marginTop: 16 }}>
        {clips.length === 0 ? (
          <Text style={styles.sheetEmpty}>Nothing recorded on that day.</Text>
        ) : clips.map((c, i) => (
          <View key={i} style={styles.sheetRow}>
            <Feather name="film" size={16} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowText}>{c.event}</Text>
              <Text style={styles.cardSub}>{c.time} · {c.mins} min · {quality}</Text>
            </View>
            <Pressable onPress={() => download(c)} hitSlop={10} style={styles.pbDl}>
              <Feather name="download" size={16} color={colors.gold} />
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={styles.pbNote}>
        Kept for seven days on ARERA, then deleted automatically. Save anything you want to keep.
      </Text>

      <Pressable onPress={() => { tap(); onShare(); }} style={[styles.obBtn, { marginTop: 12 }]}>
        <Text style={styles.obBtnText}>Save this week to your phone</Text>
      </Pressable>
    </Sheet>
  );
}

function PlaybackSheetOld({ events, onClose, onShare }) {
  return (
    <Sheet title={t("Playback & download")} onClose={onClose}>
      <Text style={styles.sheetBody}>Everything the brooch noticed, newest first. Download sends it as a text file you can hand to a doctor.</Text>
      <Pressable onPress={() => { tap(); onShare(); }} style={[styles.obBtn, { marginBottom: 18 }]}>
        <Text style={styles.obBtnText}>{t("Download this week")}</Text>
      </Pressable>
      {events.length === 0
        ? <Text style={styles.sheetEmpty}>{t("Nothing recorded yet.")}</Text>
        : events.map((e, i) => (
            <View key={i} style={styles.sheetRow}>
              <Feather name="clock" size={16} color={colors.muted} />
              <Text style={styles.sheetRowText}>{e.text}</Text>
              <Text style={styles.sheetRowMeta}>{e.time}</Text>
            </View>
          ))}
    </Sheet>
  );
}

function CareSheet({ household, onClose, onPlan, onAddMember, onRemoveMember }) {
  const members = (household && household.members) || [];
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('Backup');
  return (
    <Sheet title="ARERA Care" onClose={onClose}>
      <Text style={styles.sheetBody}>If you do not respond to a night alert within two minutes, the next person on this list is called. This is part of Pro+.</Text>
      <Text style={styles.cardLabel}>{t("ESCALATION ORDER")}</Text>
      {members.map((m, i) => (
        <View key={i} style={styles.sheetRow}>
          <View style={styles.sheetNum}><Text style={styles.sheetNumText}>{i + 1}</Text></View>
          <Text style={styles.sheetRowText}>{m.name}</Text>
          <Text style={styles.sheetRowMeta}>{m.role}</Text>
          {i > 0 && (
            <Pressable onPress={() => { tap(); onRemoveMember(i); }} hitSlop={10} style={{ marginLeft: 10 }}>
              <Feather name="x" size={14} color={colors.muted} />
            </Pressable>
          )}
        </View>
      ))}
      {members.length < 2 && (
        <Text style={styles.sheetEmpty}>{t("Add a second person in Settings so someone is always next.")}</Text>
      )}
      <Pressable onPress={() => { tap(); onPlan(); }} style={[styles.obBtn, { marginTop: 18 }]}>
        <Text style={styles.obBtnText}>{t("See what Pro+ includes")}</Text>
      </Pressable>
    </Sheet>
  );
}

function PlanSheet({ membership, onClose, onSubscribe, onCancel }) {
  return (
    <Sheet title={membership.isPro ? t('Your plan') : 'ARERA Pro+'} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Text style={styles.planName}>ARERA Pro+</Text>
        <View style={[styles.proBadge, !membership.isPro && { backgroundColor: colors.surfaceRaised }]}>
          <Feather name="star" size={10} color={membership.isPro ? colors.onGold : colors.muted} />
          <Text style={[styles.proBadgeText, !membership.isPro && { color: colors.muted }]}>
            {membership.isPro ? 'MEMBER' : t('NOT SUBSCRIBED')}
          </Text>
        </View>
      </View>
      {membership.isPro ? (
        <Text style={styles.sheetBody}>You are on the {membership.months} month plan. Thirty days of recorded history, snapshot alerts, and ARERA Care escalation are all switched on.</Text>
      ) : (
        <Text style={styles.sheetBody}>Three months included. Thirty days of recorded history, snapshot alerts the moment something changes, and ARERA Care so someone is always next in line.</Text>
      )}

      {['30 days of recorded history', 'Snapshot alerts', t('ARERA Care escalation'), t('Priority support')].map((line) => (
        <View key={line} style={styles.sheetRow}>
          <Feather name="check" size={15} color={colors.gold} />
          <Text style={styles.sheetRowText}>{line}</Text>
        </View>
      ))}

      <Pressable onPress={() => { tap(); membership.isPro ? onCancel() : onSubscribe(); }}
        style={[styles.obBtn, { marginTop: 18, backgroundColor: membership.isPro ? 'transparent' : colors.gold, borderColor: membership.isPro ? colors.border : colors.gold }]}>
        <Text style={[styles.obBtnText, membership.isPro && { color: colors.muted }]}>
          {membership.isPro ? t('Cancel Pro+') : t('Start Pro+ · 3 months')}
        </Text>
      </Pressable>
    </Sheet>
  );
}

function ConversationsSheet({ onClose }) {
  return (
    <Sheet title="What it said" onClose={onClose}>
      <Text style={styles.sheetBody}>
        Every exchange the brooch had today, in the order it happened. No audio is kept, only this.
      </Text>
      {CONVERSATIONS.map((c, i) => (
        <View key={i} style={styles.convRow}>
          <Text style={styles.convTime}>{c.time}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.convText}>{c.said}</Text>
            <Text style={styles.convTopic}>{c.topic}</Text>
          </View>
        </View>
      ))}
    </Sheet>
  );
}

/* ---------- HISTORY ---------- */
// Shaped to match a `events` read from Supabase: one row per event with a type
// and a timestamp. Swap HISTORY for that query and the screen does not change.
// What the brooch actually said. No audio and no transcript, only the shape of
// the exchange, which is what the privacy promise allows us to keep.
const CONVERSATIONS = [
  { time: '8:12 AM', said: 'Good morning, Dad. It is Tuesday.', topic: 'Morning' },
  { time: '8:14 AM', said: 'He said he slept badly. It asked if he wanted the window open.', topic: 'Morning' },
  { time: '11:40 AM', said: 'He asked what day it was. It told him, then reminded him about lunch.', topic: 'Orientation' },
  { time: '2:05 PM', said: 'He asked for water. It told him the glass was on the side table.', topic: 'Routine' },
  { time: '5:30 PM', said: 'It played your message about the evening walk.', topic: 'Your voice' },
  { time: '9:38 PM', said: 'He said he was going to bed. It said goodnight.', topic: 'Evening' },
];

// Morning, afternoon and evening, in the shape a tired daughter wants at 11pm.
const DAY = [
  { part: 'Morning', state: 'Settled', line: 'Up at 7:20. Breakfast, two conversations, the tablets reminder played.' },
  { part: 'Afternoon', state: 'Quiet', line: 'A long nap. One reminder, no wandering.' },
  { part: 'Evening', state: 'Settled', line: 'Dinner, television, in bed by 9:40.' },
];

const HISTORY = [
  { day: 'Tonight', date: t('Tue 28'), ups: 2, quiet: '6h 10m',
    events: [ { time: '1:42 AM', text: 'Got up, back in bed after 4 min' },
              { time: '11:58 PM', text: 'Got up, back in bed after 6 min' } ] },
  { day: 'Mon', date: 'Mon 27', ups: 3, quiet: '4h 45m',
    events: [ { time: '3:10 AM', text: 'Got up, back in bed after 9 min' },
              { time: '2:04 AM', text: 'Asked for water, settled again' },
              { time: '12:20 AM', text: 'Got up, back in bed after 3 min' } ] },
  { day: 'Sun', date: t('Sun 26'), ups: 1, quiet: '7h 25m',
    events: [ { time: '4:31 AM', text: 'Got up, back in bed after 5 min' } ] },
  { day: 'Sat', date: t('Sat 25'), ups: 0, quiet: '8h 40m', events: [] },
  { day: 'Fri', date: 'Fri 24', ups: 2, quiet: '5h 50m',
    events: [ { time: '2:15 AM', text: 'Got up, back in bed after 7 min' },
              { time: '12:40 AM', text: 'Got up, back in bed after 4 min' } ] },
  { day: 'Thu', date: t('Thu 23'), ups: 4, quiet: '3h 20m',
    events: [ { time: '4:52 AM', text: 'Got up, back in bed after 11 min' },
              { time: '3:08 AM', text: 'Got up, back in bed after 6 min' },
              { time: '1:37 AM', text: 'Asked for water, settled again' },
              { time: '11:20 PM', text: 'Brooch put on for the night' } ] },
  { day: 'Wed', date: t('Wed 22'), ups: 1, quiet: '6h 55m',
    events: [ { time: '5:04 AM', text: 'Got up, back in bed after 4 min' } ] },
];

const upsWord = (n) => (n === 0 ? t('Slept through') : n === 1 ? t('Up once') : n === 2 ? t('Up twice') : `Up ${n} times`);

function HistoryScreen() {
  const [open, setOpen] = useState(0);
  const nights = HISTORY.length;
  const totalUps = HISTORY.reduce((a, n) => a + n.ups, 0);
  const best = HISTORY.reduce((a, n) => (parseFloat(n.quiet) > parseFloat(a.quiet) ? n : a), HISTORY[0]);
  const peak = Math.max(1, ...HISTORY.map((n) => n.ups));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <Text style={styles.eyebrow}>{t("History")}</Text>
      <Headline template="Every night,\nremembered." name="" />

      <View style={styles.statRow}>
        <View style={styles.stat}><Text style={styles.statNum}>{nights}</Text><Text style={styles.statLabel}>nights</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{totalUps}</Text><Text style={styles.statLabel}>times up</Text></View>
        <View style={styles.stat}><Text style={styles.statNum}>{best.quiet}</Text><Text style={styles.statLabel}>longest quiet</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t("THE WEEK")}</Text>
        <View style={styles.chart}>
          {HISTORY.slice().reverse().map((n, i) => (
            <View key={n.date} style={styles.chartCol}>
              <View style={styles.chartTrack}>
                <View style={[styles.chartBar, { height: `${Math.max(6, (n.ups / peak) * 100)}%`,
                  backgroundColor: n.ups === 0 ? colors.safe : colors.gold }]} />
              </View>
              <Text style={styles.chartLabel}>{n.date.split(' ')[0]}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.cardSub}>{t("Most nights, up once or twice. Thursday was the hardest.")}</Text>
      </View>

      <Text style={styles.sectionTitle}>{t("Night by night")}</Text>
      {HISTORY.map((n, i) => (
        <Pressable key={n.date} onPress={() => { tap(); setOpen(open === i ? -1 : i); }} style={styles.nightRow}>
          <View style={styles.nightHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nightTitle}>{n.date}</Text>
              <Text style={styles.cardSub}>{upsWord(n.ups)} · quiet {n.quiet}</Text>
            </View>
            <Feather name={open === i ? 'chevron-up' : 'chevron-down'} size={17} color={colors.muted} />
          </View>
          {open === i && (
            <View style={styles.nightBody}>
              {n.events.length === 0
                ? <Text style={styles.cardSub}>{t("Nothing recorded. A full night.")}</Text>
                : n.events.map((e, k) => (
                    <View key={k} style={styles.nightEvent}>
                      <Text style={styles.nightTime}>{e.time}</Text>
                      <Text style={styles.nightText}>{e.text}</Text>
                    </View>
                  ))}
            </View>
          )}
        </Pressable>
      ))}
      <Text style={styles.demoNote}>{t("Last 7 nights · read from the hub")}</Text>
    </ScrollView>
  );
}

/* ---------- SETTINGS ---------- */
function SettingsScreen({ onClose, theme, onTheme, household, settings, onSettings, membership, onPlan, lang, onLanguage }) {
  const alerts = settings.alerts;
  const camera = settings.camera;
  const sound = settings.sound;
  const setAlerts = (v) => onSettings({ ...settings, alerts: v });
  const setCamera = (v) => onSettings({ ...settings, camera: v });
  const setSound = (v) => onSettings({ ...settings, sound: v });

  const Row = ({ label, value }) => (
    <View style={styles.setRow}>
      <Text style={styles.setLabel}>{label}</Text>
      <Text style={styles.setValue}>{value}</Text>
    </View>
  );
  const Toggle = ({ label, sub, value, onChange }) => (
    <View style={styles.setRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.setLabel}>{label}</Text>
        {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
      </View>
      <GoldSwitch value={value} onChange={onChange} />
    </View>
  );

  return (
    <View style={styles.setScreen}>
      <ScrollView contentContainerStyle={styles.setContent}>
        <View style={styles.setTop}>
          <Text style={styles.setTitle}>{t("Settings")}</Text>
          <Pressable onPress={() => { tap(); onClose(); }} style={styles.setClose} hitSlop={10}>
            <Feather name="x" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <Text style={styles.cardLabel}>{t("WHO IT'S FOR")}</Text>
        <View style={styles.setCard}>
          <Row label={t("Wearing it")} value={demo.person} />
          <Row label={t("Household")} value={demo.caregiver} />
          <Row label={t("Photos on file")} value={String((household && household.photos) || 0)} />
          <Row label={t("Brooch")} value={demo.brooch.worn ? 'Worn' : t('Not worn')} />
          <Row label={t("Battery level")} value={`${demo.brooch.battery}%`} />
          <Row label={t("Hub")} value={demo.hub.online ? 'Online' : 'Offline'} />
          <Row label={t("Wi-Fi")} value={demo.hub.wifi} />
        </View>

        <Text style={styles.cardLabel}>MEMBERSHIP</Text>
        <View style={styles.setCard}>
          <View style={styles.setRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.setLabel}>{MEMBERSHIP.plan}</Text>
                <View style={styles.proBadge}>
                  <Feather name="star" size={10} color={colors.onGold} />
                  <Text style={styles.proBadgeText}>MEMBER</Text>
                </View>
              </View>
              <Text style={styles.cardSub}>{membership.months} months · renews automatically</Text>
            </View>
          </View>
          <Pressable onPress={() => { tap(); onPlan(); }} style={styles.setRow}>
            <Text style={styles.setLabel}>{t("Manage plan")}</Text>
            <Feather name="chevron-right" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <Text style={styles.cardLabel}>LANGUAGE</Text>
        <View style={styles.setCard}>
          <View style={[styles.setRow, { flexWrap: 'wrap', gap: 8, paddingVertical: 14 }]}>
            {LANGUAGES.map((l) => (
              <Pressable key={l.code} onPress={() => { tap(); onLanguage(l.code); }}
                style={[styles.langChip, lang === l.code && styles.langChipOn]}>
                <Text style={[styles.langChipText, lang === l.code && { color: colors.onGold }]}>{l.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.cardLabel}>APPEARANCE</Text>
        <View style={styles.setCard}>
          <View style={styles.setRow}>
            <Text style={styles.setLabel}>{t("Theme")}</Text>
            <View style={styles.seg}>
              {['light', 'dark'].map((m) => (
                <Pressable key={m} onPress={() => { tap(); onTheme(m); }}
                  style={[styles.segBtn, theme === m && styles.segBtnOn]}>
                  <Text style={[styles.segText, theme === m && styles.segTextOn]}>
                    {m === 'light' ? 'Light' : 'Dark'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <Text style={styles.cardLabel}>NOTIFICATIONS</Text>
        <View style={styles.setCard}>
          <Toggle label={t("Night alerts")} sub={t("When Dad gets up and does not settle")} value={alerts} onChange={setAlerts} />
          <Toggle label={t("Sound")} sub={t("A soft tone, never a siren")} value={sound} onChange={setSound} />
        </View>

        <Text style={styles.cardLabel}>PRIVACY</Text>
        <View style={styles.setCard}>
          <Toggle label={t("Live view")} sub={t("Camera on the Dementia Care brooch")} value={camera} onChange={setCamera} />
        </View>
        <Text style={styles.setNote}>The camera is off by default. Nothing recorded is sold, and you can ask us to delete everything.</Text>

        <Text style={styles.cardLabel}>ABOUT</Text>
        <View style={styles.setCard}>
          <Row label={t("Version")} value="1.0.0" />
          <Row label={t("Built by")} value="ARERA" />
        </View>
      </ScrollView>
    </View>
  );
}

/* ---------- VISITOR (brooch camera) ---------- */
function VisitorScreen({ visitor, onAnswer }) {
  useEffect(() => {
    Vibration.vibrate([0, 400, 300, 400]);
    Speech.speak(`Someone is with ${demo.person}. Who is this?`, { rate: 0.95 });
    return () => { Vibration.cancel(); Speech.stop(); };
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>Just now · {visitor.time}</Text>
        <Text style={styles.headline}>
          Someone is with{'\n'}<Text style={styles.headlineGold}>{demo.person}.</Text>
        </Text>
        <Image source={{ uri: visitor.photo }} style={styles.visitorPhoto} resizeMode="cover" />
        <Text style={styles.sectionTitle}>Who is this?</Text>
        <Pressable style={[styles.goldBtn, { marginTop: 0 }]} onPress={() => onAnswer('family or a friend')}>
          <Feather name="heart" size={16} color={colors.onGold} />
          <Text style={styles.goldBtnText}>Family or a friend</Text>
        </Pressable>
        <Pressable style={styles.ghostBtn} onPress={() => onAnswer('a caregiver')}>
          <Feather name="user-check" size={16} color={colors.gold} />
          <Text style={[styles.btnText, { color: colors.gold }]}>A caregiver or nurse</Text>
        </Pressable>
        <Pressable style={[styles.ghostBtn, { borderColor: colors.alert }]} onPress={() => onAnswer("I don't know them")}>
          <Feather name="alert-triangle" size={16} color={colors.alert} />
          <Text style={[styles.btnText, { color: colors.alert }]}>I don't know them</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ---------- LIVE VIEW ---------- */
// The dementia-care brooch carries a camera. This is the family's window into it.
// The clip here is a concept preview; on a real device the same view is fed by
// the brooch over a signed stream, and it is off unless the family has turned it on.
// Point EXPO_PUBLIC_LIVE_STREAM_URL at the brooch's stream (HLS .m3u8 or MP4)
// and every live surface switches to it. Without it, the bundled clip is used
// so the UI can be built and reviewed before the hardware exists.
const LIVE_URL = process.env.EXPO_PUBLIC_LIVE_STREAM_URL;
const LIVE_SOURCE = LIVE_URL ? { uri: LIVE_URL } : require('./assets/live-preview.mp4');
// The real brooch (ESP32-S3 camera) on the same Wi-Fi. Set EXPO_PUBLIC_BROOCH_IP in app/.env.local
const BROOCH_IP = Platform.OS === 'web' ? undefined : process.env.EXPO_PUBLIC_BROOCH_IP;
const IS_LIVE = Boolean(LIVE_URL || BROOCH_IP);

// Pulls still frames from the brooch's /capture endpoint, back to back.
// Two stacked images: the hidden one loads the next frame, then swaps in, so there is no flicker.
function BroochFeed({ style }) {
  const [n, setN] = useState(0);
  const uri = (i) => `http://${BROOCH_IP}/capture?f=${i}`;
  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: '#000' }]}>
      <Image source={{ uri: uri(n) }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />
      <Image
        source={{ uri: uri(n + 1) }}
        style={[StyleSheet.absoluteFill, { opacity: 0 }]}
        fadeDuration={0}
        onLoad={() => setN((x) => x + 1)}
        onError={() => setTimeout(() => setN((x) => x + 1), 600)}
      />
    </View>
  );
}

function Scrim({ from, height, steps = 44 }) {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, height, [from]: 0, pointerEvents: 'none' }} pointerEvents="none">
      {Array.from({ length: steps }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: `rgba(0,0,0,${(((from === 'top' ? steps - i : i + 1) / steps) * 0.72).toFixed(3)})`,
          }}
        />
      ))}
    </View>
  );
}

function LiveCard({ onOpen }) {
  const player = useVideoPlayer(LIVE_SOURCE, (p) => {
    p.loop = !IS_LIVE;
    p.muted = true;
    p.play();
  });

  return (
    <Pressable onPress={() => { tap(); onOpen(); }} style={styles.liveCard}>
      <View style={styles.liveHead}>
        <View style={styles.liveIcon}><Feather name="video" size={15} color={colors.gold} /></View>
        <Text style={styles.liveTitle}>{t("Live view")}</Text>
        <View style={styles.liveOn}>
          <View style={styles.liveDotSmall} />
          <Text style={styles.liveOnText}>{IS_LIVE ? 'LIVE' : 'SAMPLE'}</Text>
        </View>
      </View>
      <View style={styles.liveFrame}>
        {BROOCH_IP
          ? <BroochFeed style={StyleSheet.absoluteFill} />
        : <VideoView player={player} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} contentFit="cover" nativeControls={false} />}
        <View style={styles.livePlay}><Feather name="play" size={20} color={colors.onGold} /></View>
        <View style={styles.liveExpand}><Feather name="maximize-2" size={14} color={colors.ink} /></View>
      </View>
    </Pressable>
  );
}

function LiveScreen({ onClose, onUpgrade, onSettings, onSnapshot, onPlayback, onCare, membership, onSay }) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [talking, setTalking] = useState(false);
  const [alarm, setAlarm] = useState(true);
  const [privateMode, setPrivateMode] = useState(false);
  const [promo, setPromo] = useState(true);
  const [stamp, setStamp] = useState('');
  const [fill, setFill] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [shot, setShot] = useState(null);
  const feedRef = useRef(null);

  const player = useVideoPlayer(LIVE_SOURCE, (p) => {
    p.loop = !IS_LIVE;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      setStamp(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Leaving the live view ends the session for everyone: the camera stops and
  // the family stops seeing into the room. That is the promise, so it is asked.
  // Take a still of what is on screen and put it in the phone's gallery, so the
  // family has the picture even after the live view is closed.
  const takePhoto = async () => {
    tap();
    if (privateMode) { setShot('The camera is off, so there is nothing to capture.'); return; }
    setShot('Capturing…');

    // web: draw the video element straight onto a canvas
    if (Platform.OS === 'web') {
      try {
        const v = document.querySelector('video');
        if (!v) throw new Error('no video');
        const canvas = document.createElement('canvas');
        canvas.width = v.videoWidth || 1280;
        canvas.height = v.videoHeight || 720;
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.92);
        const a = document.createElement('a');
        a.href = url;
        a.download = `arera-${Date.now()}.jpg`;
        a.click();
        setShot('Saved to your downloads.');
      } catch (e) {
        setShot('Could not capture that frame.');
      }
      return;
    }

    // native: capture the view, then write it into the gallery
    try {
      if (!captureRef) { setShot('Capturing needs the installed app.'); return; }
      if (MediaLibrary) {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) { setShot('Photo access was not given, so nothing was saved.'); return; }
      }
      const uri = await captureRef(feedRef, { format: 'jpg', quality: 0.92 });
      if (MediaLibrary) await MediaLibrary.saveToLibraryAsync(uri);
      setShot('Saved to your gallery.');
    } catch (e) {
      setShot('Could not save that photo.');
    }
  };

  const closeWithCamera = () => {
    if (privateMode) { onClose(); return; }
    Alert.alert(
      'Stop the camera?',
      `You will stop seeing the room, and the camera turns off until someone opens it again. Fall detection and the night alert keep working.`,
      [
        { text: 'Keep watching', style: 'cancel' },
        { text: 'Stop the camera', style: 'destructive', onPress: async () => {
            try { await supabase.from('events').insert({ type: 'camera_off', detail: 'Family stopped the camera', household: HOUSEHOLD }); } catch (e) {}
            onClose();
          } },
      ],
    );
  };

  const togglePlay = () => { tap(); if (player.playing) { player.pause(); setPaused(true); } else { player.play(); setPaused(false); } };
  const toggleMute = () => { tap(); player.muted = !player.muted; setMuted(player.muted); };

  const Action = ({ icon, label, active, onPress }) => (
    <Pressable onPress={() => { tap(); onPress(); }} style={styles.lvAction}>
      <View style={[styles.lvActionIcon, active && { borderColor: colors.gold, backgroundColor: colors.surfaceRaised }]}>
        <Feather name={icon} size={19} color={active ? colors.gold : colors.ink} />
      </View>
      <Text style={[styles.lvActionLabel, active && { color: colors.gold }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.lvRoot}>
      {/* bar */}
      <View style={styles.lvBar}>
        <Pressable onPress={() => { tap(); closeWithCamera(); }} hitSlop={10} style={styles.lvBarBtn}>
          <Feather name="chevron-left" size={24} color={colors.ink} />
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={styles.lvBarTitle}>ARERA Brooch</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Feather name="wifi" size={11} color={colors.muted} />
            <Text style={styles.lvBarSub}>{privateMode ? 'Privacy mode' : t('Connected · Live')}</Text>
          </View>
        </View>
        <Pressable onPress={() => { tap(); onSettings(); }} hitSlop={10} style={styles.lvBarBtn}>
          <Feather name="settings" size={19} color={colors.ink} />
        </Pressable>
      </View>

      {/* feed */}
      <View ref={feedRef} collapsable={false} style={[styles.lvFrame, fill && { aspectRatio: undefined, flex: 1 }]}>
        {privateMode ? (
          <View style={styles.lvOff}>
            <Feather name="eye-off" size={30} color={colors.muted} />
            <Text style={styles.lvOffTitle}>The camera is off</Text>
            <Text style={styles.lvOffBody}>Nobody can see into the room. Fall detection and the night alert keep running.</Text>
          </View>
        ) : (
          BROOCH_IP
            ? <BroochFeed style={styles.lvVideo} />
            : <VideoView player={player} style={styles.lvVideo} contentFit="cover" nativeControls={false} />
        )}
        <Text style={styles.lvStamp}>{stamp}</Text>
        <View style={styles.lvLivePill}>
          <View style={styles.lvLiveDot} />
          <Text style={styles.lvLiveText}>{t("Live")}</Text>
        </View>
        <View style={styles.lvFrameBar}>
          <Pressable onPress={() => { takePhoto(); }} hitSlop={8}>
            <Feather name="plus-square" size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.lvAuto}>{zoom ? t('Zoom 2×') : 'Auto'}</Text>
          <Pressable onPress={() => { tap(); setFill(!fill); }} hitSlop={8}>
            <Feather name={fill ? 'minimize' : 'maximize'} size={19} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      {shot ? (
        <Pressable onPress={() => setShot(null)} style={styles.lvShot}>
          <Feather name={/Saved/.test(shot) ? 'check-circle' : 'info'} size={14} color={/Saved/.test(shot) ? colors.safe : colors.muted} />
          <Text style={styles.lvShotText}>{shot}</Text>
        </Pressable>
      ) : null}

      {/* strip */}
      <View style={styles.lvStrip}>
        <Pressable onPress={() => { takePhoto(); }} style={styles.lvStripBtn}><Feather name="camera" size={21} color={colors.ink} /></Pressable>
        <Pressable onPress={() => { tap(); togglePlay(); }} style={styles.lvStripBtn}><Feather name={paused ? 'play' : 'video'} size={21} color={colors.ink} /></Pressable>
        <Pressable onPress={() => { tap(); toggleMute(); }} style={styles.lvStripBtn}><Feather name={muted ? 'volume-x' : 'volume-2'} size={21} color={colors.ink} /></Pressable>
        <Pressable onPress={() => { tap(); onSay(); }} style={styles.lvStripBtn}>
          <Feather name="phone" size={21} color={colors.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.lvBody}>
        {/* quick actions */}
        <View style={styles.lvGrid}>
          <Action icon="mic" label={t("Talk")} onPress={() => onSay()} />
          <Action icon="bell-off" label={t("Alarm off")} active={!alarm} onPress={async () => {
            const next = !alarm;
            setAlarm(next);
            try {
              await supabase.from('devices').upsert(
                { household: HOUSEHOLD, siren_muted: next, last_seen: new Date().toISOString() },
                { onConflict: 'pairing_code' },
              );
            } catch (e) {}
          }} />
          <Action icon="eye-off" label={t("Privacy mode")} active={privateMode} onPress={() => setPrivateMode(!privateMode)} />
          <Action icon="shield" label="ARERA Care" onPress={() => onCare()} />
        </View>

        <Pressable onPress={() => { tap(); onPlayback(); }} style={styles.lvRow}>
          <Feather name="rotate-ccw" size={18} color={colors.ink} />
          <Text style={styles.lvRowText}>{t("Playback & download")}</Text>
          <Feather name="chevron-right" size={18} color={colors.muted} />
        </Pressable>

        {/* Pro+ */}
        {promo && (
          <View style={styles.lvPromo}>
            <Pressable onPress={() => { tap(); setPromo(false); }} style={styles.lvPromoClose} hitSlop={10}>
              <Feather name="x" size={14} color={colors.muted} />
            </Pressable>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={styles.lvPromoTitle}>{MEMBERSHIP.plan}</Text>
              {membership.isPro && (
                <View style={styles.proBadge}>
                  <Feather name="star" size={10} color={colors.onGold} />
                  <Text style={styles.proBadgeText}>MEMBER</Text>
                </View>
              )}
            </View>
            <Text style={styles.lvPromoBody}>
              {membership.isPro
                ? `You are a member. ${MEMBERSHIP.months} months of recorded history, snapshot alerts and a person to call are included.`
                : 'Thirty days of recorded history, snapshot alerts when something changes, and a person to call when you need one.'}
            </Text>
            <View style={styles.lvPromoBadges}>
              <View style={styles.lvBadge}><Feather name="archive" size={13} color={colors.gold} /><Text style={styles.lvBadgeText}>3 month history</Text></View>
              <View style={styles.lvBadge}><Feather name="zap" size={13} color={colors.gold} /><Text style={styles.lvBadgeText}>{t("Snapshot alerts")}</Text></View>
            </View>
            <Pressable onPress={() => { tap(); onUpgrade(); }} style={styles.lvPromoBtn}>
              <Text style={styles.lvPromoBtnText}>{membership.isPro ? 'Manage plan' : t('Upgrade to Pro+')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ---------- TONIGHT ---------- */
function TonightScreen({ events, onSimulate, onSimulateFall, setLiveOpen, membership, onConversations }) {
  const getUps = events.filter((e) => e.type !== 'info').length;
  const lastQuiet = events.find((e) => e.type !== 'info')?.time ?? 'bedtime';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <View style={styles.greetRow}>
        <Text style={styles.eyebrow}>{greeting()}</Text>
        {membership.isPro && (
          <View style={styles.proChip}>
            <Feather name="star" size={10} color={colors.gold} />
            <Text style={styles.proChipText}>{t("PRO+")}</Text>
          </View>
        )}
      </View>
      <Headline template="{{name}}'s safe\nat home." name={demo.person} />

      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <BreathingDot color={colors.safe} />
          <Text style={styles.statusTitle}>{t("In his bedroom")}</Text>
        </View>
        <Text style={styles.statusSub}>All quiet since {lastQuiet}</Text>
      </View>

      <LiveCard onOpen={() => setLiveOpen(true)} />

      <View style={styles.card}>
        <Text style={styles.cardLabel}>TONIGHT</Text>
        <Text style={styles.tonightTitle}>
          {getUps === 0 ? t('Slept through so far')
            : `Up ${getUps === 1 ? 'once' : getUps === 2 ? 'twice' : `${getUps} times`}`}
        </Text>
        <Text style={styles.cardSub}>{t("Every time is saved below")}</Text>
      </View>

      <Text style={styles.sectionTitle}>How the day went</Text>
      {DAY.map((d) => (
        <View key={d.part} style={styles.dayRow}>
          <View style={[styles.dayDot, d.state === 'Quiet' && { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.dayPart}>{d.part}</Text>
              <Text style={[styles.dayState, d.state === 'Quiet' && { color: colors.muted }]}>{d.state}</Text>
            </View>
            <Text style={styles.dayLine}>{d.line}</Text>
          </View>
        </View>
      ))}

      <Pressable onPress={() => { tap(); onConversations(); }} style={styles.talkCard}>
        <View style={styles.talkIcon}><Feather name="message-circle" size={18} color={colors.gold} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.talkTitle}>It spoke {CONVERSATIONS.length} times today</Text>
          <Text style={styles.cardSub}>What it said, and what he asked</Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </Pressable>

      <Text style={styles.sectionTitle}>{t("The night so far")}</Text>
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
        <Text style={styles.simText}>{t("Simulate a night alert")}</Text>
      </Pressable>
    </ScrollView>
  );
}



/* ---------- PEOPLE THE BROOCH RECOGNISES ---------- */
// This is the core of the dementia brooch: you teach it faces. Each person is
// saved locally and pushed to Supabase, which the hub reads to enrol them.
const PEOPLE_KEY = 'arera.people.v1';

function PeopleCard() {
  const [people, setPeople] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Daughter');
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => { (async () => setPeople(await readKey(PEOPLE_KEY, [])))(); }, []);

  const persist = async (next) => { setPeople(next); await writeKey(PEOPLE_KEY, next); };

  const pick = async () => {
    tap();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setNote(t('Photo access was not given.')); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.6 });
      if (!res.canceled) setPicked([...picked, ...res.assets.map((a) => a.uri)]);
    } catch (e) { setNote(t('Could not open your photos.')); }
  };

  const save = async () => {
    if (!name.trim()) { setNote(t('A name is needed so the brooch can say it.')); return; }
    tap();
    setBusy(true);
    setNote(null);
    const person = {
      id: String(Date.now()),
      name: name.trim(),
      relationship,
      photos: picked,
      synced: false,
      addedAt: new Date().toISOString(),
    };

    // push to Supabase, which is what the hub reads. If it cannot reach the
    // server the person is still saved here and marked unsynced.
    // push the actual images to storage, then the row that points at them
    let synced = false;
    const uploaded = [];
    for (let i = 0; i < person.photos.length; i++) {
      try {
        const res = await fetch(person.photos[i]);
        const blob = await res.blob();
        const path = `demo/${person.id}/${i}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('people')
          .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (!upErr) uploaded.push(path);
      } catch (e) {}
    }

    try {
      const { data, error } = await supabase.from('people').insert({
        household: HOUSEHOLD,
        name: person.name,
        relationship: person.relationship,
        photo_count: uploaded.length || person.photos.length,
        photo_paths: uploaded,
      }).select('id').single();
      if (!error && data && uploaded.length) {
        await supabase.from('people_photos').insert(
          uploaded.map((path) => ({ person_id: data.id, storage_path: path })),
        );
      }
      synced = !error;
    } catch (e) { synced = false; }

    const next = [{ ...person, synced, uploaded: uploaded.length }, ...people];
    await persist(next);
    setBusy(false);
    setName(''); setPicked([]); setRelationship('Daughter'); setOpen(false);
    setNote(synced ? `${person.name} is enrolled. The brooch will know them.` : `${person.name} saved on this phone. It will sync when the hub is reachable.`);
  };

  const remove = async (id) => {
    tap();
    const p0 = people.find((x) => x.id === id);
    await persist(people.filter((x) => x.id !== id));
    if (p0 && p0.synced) {
      try { await supabase.from('people').delete().eq('name', p0.name).eq('household', HOUSEHOLD); } catch (e) {}
    }
  };

  const retry = async () => {
    tap();
    const next = [];
    for (const p0 of people) {
      if (p0.synced) { next.push(p0); continue; }
      let ok = false;
      try {
        const { error } = await supabase.from('people').insert({ household: HOUSEHOLD, name: p0.name, relationship: p0.relationship, photo_count: p0.photos.length });
        ok = !error;
      } catch (e) { ok = false; }
      next.push({ ...p0, synced: ok });
    }
    await persist(next);
    setNote(next.every((x) => x.synced) ? t('Everyone is on the brooch.') : t('Some could not sync. Try again when the hub is reachable.'));
  };

  return (
    <>
      <Text style={styles.sectionTitle}>{t("Who the brooch knows")}</Text>
      <Text style={[styles.cardSub, { marginTop: -6, marginBottom: 14 }]}>
        Add the people {demo.person} should recognise. Photos are what it learns from.
      </Text>

      {people.length === 0 ? (
        <View style={styles.peopleEmpty}>
          <Feather name="users" size={20} color={colors.muted} />
          <Text style={styles.peopleEmptyText}>Nobody enrolled yet. Start with the person {demo.person} sees most.</Text>
        </View>
      ) : people.map((p0) => (
        <View key={p0.id} style={styles.peopleRow}>
          <View style={styles.avatar}>{p0.name[0].toUpperCase()}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.peopleName}>{p0.name}</Text>
            <Text style={styles.cardSub}>
              {p0.relationship} · {p0.photos.length} photo{p0.photos.length === 1 ? '' : 's'} · {p0.synced ? 'on the brooch' : 'waiting to sync'}
            </Text>
          </View>
          <Pressable onPress={() => remove(p0.id)} hitSlop={10} style={styles.voiceDelete}>
            <Feather name="trash-2" size={15} color={colors.muted} />
          </Pressable>
        </View>
      ))}

      {note ? <Text style={styles.peopleNote}>{note}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 22 }}>
        <Pressable onPress={() => { tap(); setOpen(true); setNote(null); }} style={[styles.goldBtn, { flex: 1, marginTop: 0 }]}>
          <Text style={styles.goldBtnText}>{t("Add someone")}</Text>
        </Pressable>
        {people.some((x) => !x.synced) && (
          <Pressable onPress={retry} style={[styles.ghostBtn, { flex: 1 }]}>
            <Text style={styles.ghostBtnText}>{t("Sync now")}</Text>
          </Pressable>
        )}
      </View>

      {open && (
        <Sheet title={t("Add someone")} onClose={() => setOpen(false)}>
          <Text style={styles.sheetBody}>
            Four to six photos, different angles, ordinary light. The brooch only speaks when it is sure.
          </Text>
          <Text style={styles.cardLabel}>{t("THEIR NAME")}</Text>
          <TextInput value={name} onChangeText={setName} placeholder={t("Priya")} placeholderTextColor={colors.muted} style={styles.input} />
          <Text style={[styles.cardLabel, { marginTop: 14 }]}>{t("WHO THEY ARE")}</Text>
          <View style={styles.obChips}>
            {['Daughter', 'Son', 'Wife', 'Husband', 'Granddaughter', 'Grandson', 'Friend', 'Carer'].map((r) => (
              <Pressable key={r} onPress={() => { tap(); setRelationship(r); }}
                style={[styles.obChip, relationship === r && styles.obChipOn]}>
                <Text style={[styles.obChipText, relationship === r && { color: colors.onGold }]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={pick} style={[styles.obBtn, { marginTop: 18, marginBottom: 10 }]}>
            <Text style={styles.obBtnText}>{picked.length ? `${picked.length} photo${picked.length === 1 ? '' : 's'} chosen · add more` : t('Choose photos')}</Text>
          </Pressable>
          <Pressable onPress={save} disabled={busy} style={[styles.obBtn, { backgroundColor: colors.gold, borderColor: colors.gold, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[styles.obBtnText, { color: colors.onGold }]}>{busy ? 'Saving…' : t('Enrol on the brooch')}</Text>
          </Pressable>
        </Sheet>
      )}
    </>
  );
}

/* ---------- VOICE ---------- */
function useRecorder() {
  // hook must be called unconditionally inside a component that only renders
  // when expo-audio is present
  const recorder = Audio.useAudioRecorder(Audio.RecordingPresets.HIGH_QUALITY);
  return recorder;
}

function VoiceRecorder({ onSaved, onError, messages }) {
  const recorder = useRecorder();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const start = async () => {
    tap();
    onError(null);
    try {
      const perm = await Audio.requestRecordingPermissionsAsync();
      if (!perm.granted) { onError(t('Microphone access was not given. You can turn it on in Settings.')); return; }
      await Audio.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((n) => n + 1), 1000);
    } catch (e) {
      onError(t('Could not start recording on this device.'));
    }
  };

  const stop = async () => {
    tap();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setRecording(false);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) { onError(t('Nothing was captured. Try again.')); return; }
      onSaved({ id: String(Date.now()), uri, seconds, label: `Message ${messages.length + 1}` });
      setSeconds(0);
    } catch (e) {
      onError(t('Could not save that recording.'));
    }
  };

  const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  return (
    <View style={styles.voiceStage}>
      <Pressable onPress={recording ? stop : start} style={[styles.voiceBtn, recording && styles.voiceBtnOn]}>
        <Feather name={recording ? 'square' : 'mic'} size={30} color={recording ? colors.onGold : colors.gold} />
      </Pressable>
      <Text style={styles.voiceTimer}>{recording ? mmss(seconds) : t('Tap to record')}</Text>
      <Text style={styles.voiceHint}>
        {recording ? t('Recording. Tap the square to stop.') : t('Thirty seconds is plenty. Say their name first.')}
      </Text>
    </View>
  );
}

function VoiceScreen({ household }) {
  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const soundRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    (async () => setMessages(await readKey('arera.voices.v1', [])))();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (soundRef.current) { try { soundRef.current.remove(); } catch (e) {} }
    };
  }, []);

  const persist = async (next) => { setMessages(next); await writeKey('arera.voices.v1', next); };

  const onSaved = async (m) => { await persist([m, ...messages]); };

  const play = async (m) => {
    tap();
    if (!Audio) { setError(t('Playback needs the app installed on a phone.')); return; }
    try {
      if (soundRef.current) { try { soundRef.current.remove(); } catch (e) {} soundRef.current = null; }
      if (playingId === m.id) { setPlayingId(null); return; }
      const p = Audio.createAudioPlayer(m.uri);
      soundRef.current = p;
      setPlayingId(m.id);
      p.play();
      p.addListener('playbackStatusUpdate', (st) => {
        if (st.didJustFinish) { setPlayingId(null); try { p.remove(); } catch (e) {} }
      });
    } catch (e) {
      setPlayingId(null);
      setError(t('Could not play that back.'));
    }
  };

  const remove = async (id) => {
    tap();
    await persist(messages.filter((m) => m.id !== id));
  };

  const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <Text style={styles.eyebrow}>{t("Voice")}</Text>
      <Text style={styles.headline}>
        Your voice,{String.fromCharCode(10)}<Text style={styles.headlineGold}>at {household && household.person ? household.person + "'s" : 'their'} bedside.</Text>
      </Text>
      <Text style={styles.voiceLede}>
        Record a few short messages in your own voice. When {household && household.person ? household.person : 'they'} gets up at night, the hub can play one.
      </Text>

      {Audio ? (
        <VoiceRecorder onSaved={onSaved} onError={setError} messages={messages} />
      ) : (
        <View style={styles.voiceStage}>
          <Feather name="mic-off" size={30} color={colors.muted} />
          <Text style={styles.voiceHint}>{t("Recording needs the app installed on a phone.")}</Text>
        </View>
      )}

      {error && <Text style={styles.voiceError}>{error}</Text>}

      <Text style={styles.sectionTitle}>{t("Your messages")}</Text>
      {messages.length === 0 ? (
        <Text style={styles.voiceEmpty}>{t("Nothing recorded yet. The first one is the hardest.")}</Text>
      ) : messages.map((m) => (
        <View key={m.id} style={styles.voiceRow}>
          <Pressable onPress={() => play(m)} style={styles.voicePlay}>
            <Feather name={playingId === m.id ? 'pause' : 'play'} size={16} color={colors.gold} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.voiceRowTitle}>{m.label}</Text>
            <Text style={styles.voiceRowMeta}>{mmss(m.seconds || 0)} · in your voice</Text>
          </View>
          <Pressable onPress={() => remove(m.id)} hitSlop={10} style={styles.voiceDelete}>
            <Feather name="trash-2" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------- DEVICES ---------- */
function DevicesScreen() {
  const b = demo.brooch;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Header />
      <Text style={styles.eyebrow}>{t("Devices")}</Text>
      <Text style={styles.headline}>
        Everything's <Text style={styles.headlineGold}>working.</Text>
      </Text>

      <View style={styles.card}>
        <View style={styles.devTop}>
          <Feather name="circle" size={20} color={colors.gold} />
          <View style={styles.pill}><BreathingDot color={colors.safe} size={7} /><Text style={styles.pillText}>{t("Worn")}</Text></View>
        </View>
        <Text style={styles.devName}>{t("Brooch")}</Text>
        <Text style={styles.cardSub}>Last heard from {b.lastSeen}</Text>
        <View style={styles.battTrack}>
          <View style={[styles.battFill, { width: `${b.battery}%` }]} />
        </View>
        <Text style={styles.cardSub}>{b.battery}% · charges on the hub each morning</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.devTop}>
          <Feather name="radio" size={20} color={colors.gold} />
          <View style={styles.pill}><BreathingDot color={colors.safe} size={7} /><Text style={styles.pillText}>{t("Online")}</Text></View>
        </View>
        <Text style={styles.devName}>{t("Bedside hub")}</Text>
        <Text style={styles.cardSub}>Connected to {demo.hub.wifi}</Text>
        <Text style={styles.cardSub}>Room learned on {demo.hub.lastSetup}</Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.goldBtn, pressed && { opacity: 0.8 }]}
        onPress={() => {
          tap();
          Alert.alert(
            t('Room setup walk (demo)'),
            "In the real product, you walk slowly around Dad's room with the brooch so the hub learns where 'inside' ends."
          );
        }}
      >
        <Feather name="refresh-cw" size={16} color={colors.onGold} />
        <Text style={styles.goldBtnText}>{t("Re-learn the room")}</Text>
      </Pressable>
    </ScrollView>
  );
}
/* ---------- FAMILY ---------- */
const DEFAULT_REMINDERS = [
  { id: 1, time: '8:00 AM', label: 'Morning tablets', kind: 'pill', on: true },
  { id: 2, time: '2:00 PM', label: 'A glass of water', kind: 'water', on: true },
  { id: 3, time: '9:00 PM', label: 'Night tablets', kind: 'pill', on: true },
  { id: 4, time: t('Thu 11:00 AM'), label: 'Doctor visit', kind: 'doctor', on: false },
];

function FamilyScreen() {
  const [reminders, setReminders] = useState(DEFAULT_REMINDERS);

  useEffect(() => {
    (async () => {
      const saved = await readKey(REMINDERS_KEY, null);
      if (Array.isArray(saved)) setReminders(saved);
    })();
  }, []);

  // every change is saved locally and pushed to the table the hub polls
  const commit = async (next) => {
    setReminders(next);
    await writeKey(REMINDERS_KEY, next);
    try {
      await supabase.from('reminders').upsert(
        next.map((r) => ({
          household: HOUSEHOLD, local_id: String(r.id),
          time: r.time, label: r.label, kind: r.kind, active: r.on,
        })),
        { onConflict: 'household,local_id' },
      );
    } catch (e) {}
  };
  const [adding, setAdding] = useState(false);
  const [newTime, setNewTime] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const icons = { pill: 'plus-square', water: 'droplet', doctor: 'activity', other: 'bell' };

  const toggle = (id) => {
    tap();
    commit(reminders.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
  };
  const remove = (id) => {
    Alert.alert('Remove reminder?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => commit(reminders.filter((r) => r.id !== id)) },
    ]);
  };
  const add = () => {
    if (!newTime.trim() || !newLabel.trim()) return;
    tap();
    commit([...reminders, { id: Date.now(), time: newTime.trim(), label: newLabel.trim(), kind: 'other', on: true }]);
    setNewTime(''); setNewLabel(''); setAdding(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Header />
      <Text style={styles.eyebrow}>{t("Family")}</Text>
      <Headline template="{{name}}'s day,\ngently kept." name={demo.person} />

      <PeopleCard />

      <Text style={styles.sectionTitle}>{t("Daily reminders")}</Text>
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
          <GoldSwitch value={r.on} onChange={() => toggle(r.id)} />
        </Pressable>
      ))}

      {adding ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>WHAT</Text>
          <TextInput
            value={newLabel} onChangeText={setNewLabel}
            placeholder={t("e.g. Evening walk")} placeholderTextColor={colors.muted} style={styles.input}
          />
          <Text style={[styles.cardLabel, { marginTop: 12 }]}>WHEN</Text>
          <TextInput
            value={newTime} onChangeText={setNewTime}
            placeholder={t("e.g. 6:30 PM")} placeholderTextColor={colors.muted} style={styles.input}
          />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Pressable style={[styles.goldBtn, { flex: 1, marginTop: 0 }]} onPress={add}>
              <Text style={styles.goldBtnText}>{t("Save")}</Text>
            </Pressable>
            <Pressable style={[styles.ghostBtn, { flex: 1 }]} onPress={() => setAdding(false)}>
              <Text style={styles.btnText}>{t("Cancel")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.ghostBtn} onPress={() => { tap(); setAdding(true); }}>
          <Feather name="plus" size={16} color={colors.gold} />
          <Text style={[styles.btnText, { color: colors.gold }]}>{t("Add a reminder")}</Text>
        </Pressable>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 30 }]}>{t("Who gets alerted")}</Text>
      <View style={styles.card}>
        <View style={styles.personRow}>
          <View style={styles.personAvatar}><Text style={styles.avatarText}>H</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.remLabel}>{t("You")}</Text>
            <Text style={styles.cardSub}>{t("Alerted first, every night")}</Text>
          </View>
        </View>
      </View>
      <Pressable
        style={styles.ghostBtn}
        onPress={() => { tap(); onSimulateFall && onSimulateFall(); }}
      >
        <Feather name="alert-triangle" size={16} color={colors.gold} />
        <Text style={styles.ghostBtnText}>Simulate a fall</Text>
      </Pressable>

      <Pressable
        style={styles.ghostBtn}
        onPress={() => { tap(); Alert.alert('Invite family (demo)', t("Soon you can invite a sibling as a backup: if you don't respond in 2 minutes, they get the alert.")); }}
      >
        <Feather name="user-plus" size={16} color={colors.gold} />
        <Text style={[styles.btnText, { color: colors.gold }]}>{t("Add a family member")}</Text>
      </Pressable>

      <Text style={styles.demoNote}>{t("Reminders are a helping hand, not medical advice.")}</Text>
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
function AlertScreen({ time, kind = 'wake', onHandled }) {
  const [seconds, setSeconds] = useState(0);
    useEffect(() => {
    Vibration.vibrate([0, 600, 400], true);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const line = kind === 'fall'
      ? `${demo.person} has fallen in the bedroom.`
      : `${demo.person} has left the bedroom.`;
    const say = () => Speech.speak(line, { rate: 0.95 });
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
        <Text style={styles.alertTitle}>
          {kind === 'fall' ? `${demo.person} may have\nfallen` : `${demo.person} left\nthe bedroom`}
        </Text>
        <Text style={styles.alertTime}>at {time}</Text>
        <Text style={styles.alertTimer}>{mm}:{ss}</Text>
        <Text style={styles.alertSmall}>since he left</Text>
        <Text style={styles.alertDetail}>{t("Brooch moving, near the bedroom door")}</Text>
      </View>
      <View style={styles.alertButtons}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.8 }]}
          onPress={() => demoPopup(t('Play your voice'),
            "In the real product, the hub plays the message you recorded, in your voice: \"Dad, it's still night. Let's go back to bed.\"")}
        >
          <Feather name="volume-2" size={18} color={colors.alertBg} />
          <Text style={styles.btnPrimaryText}>Play my voice to {demo.person}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} onPress={() => onHandled('you went to check')}>
          <Feather name="navigation" size={17} color={colors.ink} />
          <Text style={styles.btnText}>{t("I'm going to check")}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]} onPress={() => onHandled('marked as false alarm')}>
          <Feather name="check" size={17} color={colors.ink} />
          <Text style={styles.btnText}>{t("He's okay, false alarm")}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && { opacity: 0.6 }]}
          onPress={() => demoPopup('Call 911', t('Emergency calling is disabled in the demo.'))}
        >
          <Feather name="phone" size={17} color={colors.alert} />
          <Text style={[styles.btnText, { color: colors.alert }]}>{t("Call 911")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- STYLES ---------- */
const makeStyles = () => StyleSheet.create({
  visitorPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.goldBorder, marginBottom: 6 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 22, paddingTop: 62, paddingBottom: 40 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 24, height: 24, borderRadius: 12 },
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
  tabLabel: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12, letterSpacing: 0.2 },
  gearBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  liveOn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.alert },
  liveOnText: { fontFamily: fonts.sansSemi, color: colors.muted, fontSize: 10, letterSpacing: 1.2 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  stat: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  statNum: { fontFamily: fonts.serif, color: colors.gold, fontSize: 26 },
  statLabel: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11, marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110, marginTop: 6, marginBottom: 14 },
  chartCol: { flex: 1, alignItems: 'center' },
  chartTrack: { width: '100%', height: 82, justifyContent: 'flex-end', backgroundColor: colors.surfaceRaised, borderRadius: 6, overflow: 'hidden' },
  chartBar: { width: '100%', borderRadius: 6 },
  chartLabel: { fontFamily: fonts.sans, color: colors.muted, fontSize: 10, marginTop: 7 },
  nightRow: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16, marginBottom: 10 },
  nightHead: { flexDirection: 'row', alignItems: 'center' },
  nightTitle: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15, marginBottom: 4 },
  nightBody: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  nightEvent: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  nightTime: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12, width: 62 },
  nightText: { flex: 1, fontFamily: fonts.sans, color: colors.muted, fontSize: 13, lineHeight: 19 },
  setScreen: { flex: 1, backgroundColor: colors.bg },
  setContent: { padding: 20, paddingTop: 62, paddingBottom: 60 },
  setTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 },
  setTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 34 },
  setClose: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  setCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 16, marginBottom: 22 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  setLabel: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14 },
  setValue: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14 },
  setNote: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: -12, marginBottom: 24 },
  obRoot: { flex: 1, backgroundColor: colors.bg, paddingTop: 62, paddingHorizontal: 22, paddingBottom: 26 },
  obHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 30 },
  obLogo: { width: 26, height: 26, borderRadius: 13 },
  obBrand: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 14, letterSpacing: 3 },
  obDots: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  obDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  obStep: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 26 },
  obBody: { paddingBottom: 36 },
  obTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 40, lineHeight: 44, marginBottom: 12 },
  obSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 26 },
  obLabel: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 9, marginTop: 6 },
  obInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.ink, fontFamily: fonts.sans, fontSize: 16, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 18 },
  obChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  obChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  obChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  obChipText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 13 },
  obScan: { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 40, marginBottom: 18 },
  obScanText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
  obBtn: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  obBtnText: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 14 },
  obFoot: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  obBack: { paddingHorizontal: 22, paddingVertical: 16 },
  obBackText: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 14 },
  obNext: { flex: 1, backgroundColor: colors.gold, borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  obNextText: { fontFamily: fonts.sansSemi, color: colors.onGold, fontSize: 15 },
  peopleEmpty: { alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 26, paddingHorizontal: 20, marginBottom: 14 },
  peopleEmptyText: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  peopleName: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15, marginBottom: 3 },
  peopleNote: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  splashRoot: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
  splashLogo: { width: 92, height: 92, borderRadius: 46, marginBottom: 22 },
  splashWord: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 20, letterSpacing: 9 },
  splashLoading: { position: 'absolute', bottom: 76, left: 30, right: 30, fontFamily: fonts.sans, color: colors.muted, fontSize: 12, letterSpacing: 0.4, textAlign: 'center' },
  splashLine: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 16, paddingHorizontal: 24 },
  authRoot: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 26, paddingTop: 30 },
  obSkip: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 13, textAlign: 'center' },
  obHint: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  obLangRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 18 },
  obLang: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  obLangOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  obLangText: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 11 },
  obDemo: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 5 },
  obDemoText: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 11 },
  dayRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
  dayDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.safe, marginTop: 6 },
  dayPart: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14 },
  dayState: { fontFamily: fonts.sansMedium, color: colors.safe, fontSize: 11, letterSpacing: 0.6 },
  dayLine: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  talkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 16, padding: 15, marginTop: 16, marginBottom: 6 },
  talkIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  talkTitle: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14, marginBottom: 3 },
  convRow: { flexDirection: 'row', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
  convTime: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 12, width: 62 },
  convText: { fontFamily: fonts.sans, color: colors.ink, fontSize: 13.5, lineHeight: 20 },
  convTopic: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 10.5, letterSpacing: 0.6, marginTop: 4, textTransform: 'uppercase' },
  voiceLede: { fontFamily: fonts.sans, color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14, marginBottom: 8 },
  voiceStage: { alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 30, marginTop: 14, marginBottom: 12 },
  voiceBtn: { width: 88, height: 88, borderRadius: 44, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  voiceBtnOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  voiceTimer: { fontFamily: fonts.serif, color: colors.ink, fontSize: 26, marginBottom: 6 },
  voiceHint: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12, textAlign: 'center', paddingHorizontal: 26, lineHeight: 18 },
  voiceError: { fontFamily: fonts.sansMedium, color: colors.alert, fontSize: 13, lineHeight: 19, marginBottom: 14 },
  voiceEmpty: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, paddingVertical: 12 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 10 },
  voicePlay: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  voiceRowTitle: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14, marginBottom: 3 },
  voiceRowMeta: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12 },
  voiceDelete: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  sheetRoot: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  sheetScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetCard: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 20, maxHeight: '82%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 26 },
  sheetBody: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13.5, lineHeight: 20, marginBottom: 16 },
  sheetEmpty: { fontFamily: fonts.sans, color: colors.muted, fontSize: 13, marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
  sheetRowText: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 14 },
  sheetRowMeta: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12 },
  sheetNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  sheetNumText: { fontFamily: fonts.sansSemi, color: colors.gold, fontSize: 11 },
  planName: { fontFamily: fonts.serif, color: colors.ink, fontSize: 28 },
  greetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  proChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  proChipText: { fontFamily: fonts.sansSemi, color: colors.gold, fontSize: 9, letterSpacing: 1 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { fontFamily: fonts.sansSemi, color: colors.onGold, fontSize: 9, letterSpacing: 0.8 },
  langChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  langChipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  langChipText: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 13 },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceRaised, borderRadius: 999, padding: 3 },
  segBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  segBtnOn: { backgroundColor: colors.gold },
  segText: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12 },
  segTextOn: { color: colors.onGold },
  liveCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, padding: 16, marginBottom: 14 },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  liveIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  liveTitle: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15 },
  pill: { borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 10, letterSpacing: 0.6 },
  liveFrame: { width: '100%', aspectRatio: 16 / 9, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  livePlay: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  liveExpand: { position: 'absolute', right: 10, bottom: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  liveScreen: { flex: 1, backgroundColor: '#000' },
  lvRoot: { flex: 1, backgroundColor: colors.bg },
  lvBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 54, paddingBottom: 12, backgroundColor: colors.bg },
  lvBarBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  lvBarTitle: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 16 },
  lvBarSub: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11 },
  lvFrame: { width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.frame, overflow: 'hidden' },
  lvVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  saySent: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: 12, padding: 13, marginBottom: 16 },
  saySentText: { flex: 1, fontFamily: fonts.sans, color: colors.ink, fontSize: 12.5, lineHeight: 18 },
  sayQuick: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
  sayQuickText: { flex: 1, fontFamily: fonts.sans, color: colors.ink, fontSize: 13.5, lineHeight: 19 },
  pbCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 14, marginBottom: 12 },
  pbTitle: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15, marginBottom: 3 },
  pbDay: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minWidth: 92 },
  pbDayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  pbDayLabel: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 12.5, marginBottom: 3 },
  pbDayCount: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11 },
  pbDl: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  pbNote: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 14 },
  lvShot: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 10 },
  lvShotText: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 12 },
  lvOff: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  lvOffTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 22 },
  lvOffBody: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  lvStamp: { position: 'absolute', top: 10, left: 12, fontFamily: fonts.sansMedium, color: '#fff', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  lvLivePill: { position: 'absolute', top: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  lvLiveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.alert },
  lvLiveText: { fontFamily: fonts.sansMedium, color: '#fff', fontSize: 12 },
  lvFrameBar: { position: 'absolute', left: 12, right: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lvAuto: { fontFamily: fonts.sansMedium, color: '#fff', fontSize: 13 },
  lvStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  lvStripBtn: { width: 52, height: 40, alignItems: 'center', justifyContent: 'center' },
  lvBody: { padding: 12, paddingBottom: 30 },
  lvGrid: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 16, marginBottom: 14 },
  lvAction: { flex: 1, alignItems: 'center' },
  lvActionIcon: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  lvActionLabel: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11 },
  lvRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 20, marginBottom: 14 },
  lvRowText: { flex: 1, fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15 },
  lvPromo: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.goldBorder, borderRadius: 18, padding: 18 },
  lvPromoClose: { position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  lvPromoTitle: { fontFamily: fonts.serif, color: colors.ink, fontSize: 24, marginBottom: 6 },
  lvPromoBody: { fontFamily: fonts.sans, color: colors.muted, fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  lvPromoBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  lvBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  lvBadgeText: { fontFamily: fonts.sansMedium, color: colors.gold, fontSize: 11 },
  lvPromoBtn: { backgroundColor: colors.gold, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  lvPromoBtnText: { fontFamily: fonts.sansSemi, color: colors.onGold, fontSize: 15 },
  liveFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  liveFillVideo: { width: '100%', height: '100%' },
  liveScrimTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, backgroundColor: 'rgba(0,0,0,0.55)' },
  liveScrimBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, backgroundColor: 'rgba(0,0,0,0.6)' },
  liveTopRow: { position: 'absolute', top: 56, left: 18, right: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.alert },
  liveBadgeText: { fontFamily: fonts.sansSemi, color: colors.ink, fontSize: 11, letterSpacing: 1.4 },
  liveClock: { fontFamily: fonts.sansMedium, color: colors.muted, fontSize: 12 },
  liveRound: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  liveBottom: { position: 'absolute', bottom: 42, left: 18, right: 18 },
  liveCaption: { fontFamily: fonts.sansMedium, color: colors.ink, fontSize: 15, marginBottom: 16 },
  liveControls: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  liveNote: { fontFamily: fonts.sans, color: colors.muted, fontSize: 11, lineHeight: 16 },
  swTrack: { width: 46, height: 26, borderRadius: 13, borderWidth: 1, justifyContent: 'center' },
  swThumb: { position: 'absolute', width: 20, height: 20, borderRadius: 10 },
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

let styles = makeStyles();