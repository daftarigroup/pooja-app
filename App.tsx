import React, { useCallback, useEffect, useState } from 'react';
import { View, Image, Text, Pressable, ActivityIndicator, ScrollView, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { captureRef } from 'react-native-view-shot';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as api from './src/api';
import { Employee, Leave } from './src/api';
import { Button, Field, Row, C, s, statusColor } from './src/ui';


// Alert.alert is a no-op on web, so fall back to window.alert/confirm there (browser preview).
const notify = (title: string, msg?: string) => {
  if (Platform.OS === 'web') window.alert(msg ? `${title}\n${msg}` : title);
  else Alert.alert(title, msg);
};
// On web there is no native alert sheet and window.confirm can be blocked, so log out directly there.
const confirmLogout = (onYes: () => void) => {
  if (Platform.OS === 'web') onYes();
  else Alert.alert('Log out?', '', [{ text: 'Cancel' }, { text: 'Log out', style: 'destructive', onPress: onYes }]);
};

type Tab = 'home' | 'in' | 'out' | 'half' | 'leave';
const TABS: { k: Tab; label: string; icon: any }[] = [
  { k: 'home', label: 'Home', icon: 'home' },
  { k: 'in', label: 'Check In', icon: 'log-in' },
  { k: 'out', label: 'Check Out', icon: 'log-out' },
  // Half Day tab temporarily disabled
  // { k: 'half', label: 'Half Day', icon: 'contrast' },
  { k: 'leave', label: 'Leave', icon: 'calendar' },
];

export default function App() {
  return <SafeAreaProvider><AppInner /></SafeAreaProvider>;
}

function AppInner() {
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [sess, setSess] = useState<api.Session | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [staff, setStaff] = useState<Employee[]>([]);

  useEffect(() => {
    api.setOnUnauthorized(() => setSess(null));
    api.loadSession().then((x) => { setSess(x); setReady(true); });
  }, []);
  useEffect(() => { if (sess) api.listEmployees().then(setStaff).catch(() => {}); }, [sess]);

  if (!ready) return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator color={C.amber} /></View>;
  if (!sess) return <Login onDone={(x, e) => { setSess(x); setStaff(e); setTab('home'); }} />;

  return (
    <View style={s.screen}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 36 : 20) }}>
        {tab === 'home' && <Home sess={sess} onLogout={async () => { await api.logout(); setSess(null); }} />}
        {tab === 'in' && <Punch mode="in" />}
        {tab === 'out' && <Punch mode="out" />}
        {/* {tab === 'half' && <Punch mode="half" />} */}
        {tab === 'leave' && <LeaveScreen sess={sess} staff={staff} />}
      </View>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, paddingBottom: Math.max(insets.bottom, 8) + 4, paddingTop: 8, backgroundColor: C.bg }}>
        {TABS.map((t) => (
          <Pressable key={t.k} onPress={() => setTab(t.k)} style={{ flex: 1, alignItems: 'center' }}>
            <Ionicons name={(tab === t.k ? t.icon : t.icon + '-outline') as any} size={22} color={tab === t.k ? C.amber : C.mute} />
            <Text style={{ fontSize: 10, marginTop: 2, fontWeight: '600', color: tab === t.k ? C.ink : C.mute }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Login({ onDone }: { onDone: (s: api.Session, e: Employee[]) => void }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api.login(u.trim(), p.trim()); onDone(r.session, r.employees); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <StatusBar style="dark" />
      <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: C.amber, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <Ionicons name="construct" size={38} color={C.ink} />
      </View>
      <Text style={s.h1}>Pooja Construction</Text>
      <Text style={s.sub}>Sign in once to mark attendance & apply leave</Text>
      <Field label="USERNAME" value={u} onChangeText={setU} autoCapitalize="none" autoCorrect={false} placeholder="Username" />
      <Field label="PASSWORD" value={p} onChangeText={setP} secureTextEntry placeholder="Password" />
      {!!err && <Text style={{ color: C.red, marginBottom: 12 }}>{err}</Text>}
      <Button title="Sign In" onPress={go} loading={busy} disabled={!u || !p} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function useToday() {
  const [rec, setRec] = useState<any>(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setRec(await api.todayAttendance()); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  return { rec, loading, load };
}

function Home({ sess, onLogout }: { sess: api.Session; onLogout: () => void }) {
  const e = sess.employee; const { rec, load } = useToday(); const [ref, setRef] = useState(false);
  return (
    <ScrollView contentContainerStyle={s.pad} refreshControl={<RefreshControl refreshing={ref} onRefresh={async () => { setRef(true); await load(); setRef(false); }} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View><Text style={s.h1}>Hello, {(e?.name || sess.user.name || '').split(' ')[0]}</Text><Text style={s.sub}>{new Date().toDateString()}</Text></View>
        <Pressable hitSlop={12} onPress={() => confirmLogout(onLogout)}><Ionicons name="power" size={24} color={C.red} /></Pressable>
      </View>
      {!e && <Text style={{ color: C.red, marginBottom: 12 }}>No employee profile is linked to this login. Contact HR.</Text>}
      <View style={s.card}>
        <Row k="Name" v={e?.name || sess.user.name} /><Row k="Employee Code" v={e?.empCode} /><Row k="Department" v={e?.departmentName} />
        <Row k="Designation" v={e?.designation} /><Row k="Phone" v={e?.phone} /><Row k="Email" v={e?.email} />
      </View>
      <View style={s.card}>
        <Text style={[s.label, { marginBottom: 4 }]}>TODAY'S ATTENDANCE</Text>
        <Row k="Status" v={rec?.status || 'Not marked'} /><Row k="Check In" v={rec?.checkIn} /><Row k="Check Out" v={rec?.checkOut} />
      </View>
      {!!e && <MonthAttendance refreshKey={ref} />}
    </ScrollView>
  );
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const norm = (st?: string) => (st || '').toLowerCase().replace(/[\s_]/g, '-');

function MonthAttendance({ refreshKey }: { refreshKey: boolean }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [rows, setRows] = useState<any[]>([]); const [busy, setBusy] = useState(true); const [err, setErr] = useState('');
  useEffect(() => {
    let live = true; setBusy(true); setErr('');
    api.monthAttendance(ym.y, ym.m).then((r) => { if (live) setRows(r); }).catch((e) => { if (live) setErr(e.message); }).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [ym, refreshKey]);

  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth() + 1;
  const shift = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m - 1 + d, 1); return { y: t.getFullYear(), m: t.getMonth() + 1 }; });
  const count = (f: (st: string) => boolean) => rows.filter((r) => f(norm(r.status))).length;
  const present = count((x) => x === 'present'); const half = count((x) => x.includes('half'));
  const leave = count((x) => x.includes('leave')); const absent = count((x) => x === 'absent');
  const color = (st: string) => (st === 'present' ? C.green : st === 'absent' ? C.red : C.amber);
  const stat = (label: string, n: number, c: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontSize: 20, fontWeight: '800', color: c }}>{n}</Text><Text style={{ fontSize: 10, color: C.mute, fontWeight: '600' }}>{label}</Text></View>
  );

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Pressable hitSlop={12} onPress={() => shift(-1)}><Ionicons name="chevron-back" size={22} color={C.ink} /></Pressable>
        <Text style={[s.label, { marginBottom: 0 }]}>{MONTHS[ym.m - 1].toUpperCase()} {ym.y}</Text>
        <Pressable hitSlop={12} disabled={isCurrent} onPress={() => shift(1)} style={{ opacity: isCurrent ? 0.25 : 1 }}><Ionicons name="chevron-forward" size={22} color={C.ink} /></Pressable>
      </View>
      {busy ? <ActivityIndicator color={C.amber} style={{ marginVertical: 16 }} /> : err ? <Text style={{ color: C.red }}>{err}</Text> : (
        <>
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>{stat('PRESENT', present, C.green)}{stat('HALF DAY', half, C.amber)}{stat('LEAVE', leave, C.amber)}{stat('ABSENT', absent, C.red)}</View>
          {rows.length === 0 && <Text style={{ color: C.mute, textAlign: 'center', paddingVertical: 12 }}>No attendance records this month.</Text>}
          {rows.map((r) => {
            const d = new Date(r.date + 'T00:00:00'); const st = norm(r.status);
            return (
              <View key={r.id ?? r.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderColor: C.line }}>
                <View style={{ width: 52 }}><Text style={{ fontWeight: '800', color: C.ink }}>{d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}</Text><Text style={{ fontSize: 11, color: C.mute }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text></View>
                <Text style={{ flex: 1, fontSize: 12, color: C.mute }}>{r.checkIn || '—'} → {r.checkOut || '—'}</Text>
                <Text style={{ fontWeight: '700', color: color(st), textTransform: 'capitalize' }}>{(r.status || '').replace(/[-_]/g, ' ')}</Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

const MODES = {
  in: { title: 'Check In', sub: 'Photo + location are captured automatically', icon: 'log-in', color: C.green, type: 'in' as api.PunchType },
  out: { title: 'Check Out', sub: 'Photo + location are captured automatically', icon: 'log-out', color: C.red, type: 'out' as api.PunchType },
  half: { title: 'Half Day', sub: 'Photo + location are captured automatically', icon: 'contrast', color: C.amber, type: 'half_day' as api.PunchType },
};

type Stamp = { uri: string; lines: string[]; done: (uri: string) => void; fail: (e: Error) => void };

// Burns date/time, address and GPS into the photo (like the web kiosk) by snapshotting a View with the text overlaid.
function Stamper({ stamp }: { stamp: Stamp | null }) {
  const ref = React.useRef<any>(null);
  if (!stamp) return null;
  const W = 720, H = 960;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: -5000, top: 0 }}>
      <View ref={ref} collapsable={false} style={{ width: W, height: H, backgroundColor: '#000' }}>
        <Image source={{ uri: stamp.uri }} resizeMode="cover" style={{ width: W, height: H }}
          onLoad={async () => { try { stamp.done(await captureRef(ref, { format: 'jpg', quality: 0.7, result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile' })); } catch (e: any) { stamp.fail(e); } }}
          onError={() => stamp.fail(new Error('Could not read the photo.'))} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, backgroundColor: 'rgba(0,0,0,0.55)' }}>
          {stamp.lines.map((l, i) => <Text key={i} style={{ color: '#fff', fontSize: 24, fontWeight: i === 0 ? '700' : '500', lineHeight: 34 }}>{l}</Text>)}
        </View>
      </View>
    </View>
  );
}

function Punch({ mode }: { mode: 'in' | 'out' | 'half' }) {
  const m = MODES[mode]; const { rec, load } = useToday(); const [step, setStep] = useState(''); const [stamp, setStamp] = useState<Stamp | null>(null);
  const [last, setLast] = useState<{ uri: string; lines: string[] } | null>(null);
  const busy = !!step;
  const press = async () => {
    try {
      setStep('Getting location…');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Location permission denied. Allow location to mark attendance.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude, accuracy } = pos.coords;
      const addrP = api.reverseGeocode(latitude, longitude);

      setStep('Opening camera…');
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) throw new Error('Camera permission denied. Allow camera to mark attendance.');
      const shot = await ImagePicker.launchCameraAsync({ quality: 0.6, cameraType: ImagePicker.CameraType.front, allowsEditing: false });
      if (shot.canceled) { setStep(''); return; }

      setStep('Stamping photo…');
      const address = await addrP;
      const now = new Date();
      const lines = [
        `Date & Time: ${now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`,
        ...(address ? [`Location: ${address}`] : []),
        `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}${accuracy ? ` (±${Math.round(accuracy)}m)` : ''}`,
      ];
      const stamped = await new Promise<string>((done, fail) => setStamp({ uri: shot.assets[0].uri, lines, done, fail }));
      setStamp(null);

      setLast({ uri: stamped, lines }); // show the photo + location on screen right after the shot
      setStep('Uploading…');
      const r = await api.punch(m.type, stamped, latitude, longitude, address);
      notify('Done', r.message || `${m.title} recorded`); await load();
    } catch (e: any) { notify('Error', e.message); }
    finally { setStamp(null); setStep(''); }
  };
  return (
    <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, alignItems: 'center', justifyContent: 'center' }]}>
      <Pressable onPress={press} disabled={busy} style={{ width: 170, height: 170, borderRadius: 85, backgroundColor: m.color, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name={m.icon as any} size={64} color="#fff" />}
      </Pressable>
      <Text style={[s.h1, { marginTop: 24 }]}>{m.title}</Text>
      <Text style={s.sub}>{step || m.sub}</Text>
      <View style={[s.card, { alignSelf: 'stretch' }]}>
        <Row k="Status today" v={rec?.status || 'Not marked'} /><Row k="Check In" v={rec?.checkIn} /><Row k="Check Out" v={rec?.checkOut} />
      </View>
      {last && (
        <View style={[s.card, { alignSelf: 'stretch', padding: 0, overflow: 'hidden' }]}>
          <Image source={{ uri: last.uri }} resizeMode="cover" style={{ width: '100%', aspectRatio: 3 / 4, backgroundColor: '#000' }} />
          <View style={{ padding: 14 }}>
            <Text style={[s.label, { marginBottom: 6 }]}>CAPTURED LOCATION</Text>
            {last.lines.map((l, i) => <Text key={i} style={{ color: C.ink, fontSize: 13, lineHeight: 20 }}>{l}</Text>)}
          </View>
        </View>
      )}
      <Stamper stamp={stamp} />
    </ScrollView>
  );
}

function Picker({ label, value, options, onPick, placeholder }: { label: string; value: string; options: Employee[]; onPick: (e: Employee) => void; placeholder: string }) {
  const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const list = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={s.input}><Text style={{ color: value ? C.ink : '#9CA3AF' }}>{value || placeholder}</Text></Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[s.screen, { paddingTop: 50, padding: 16 }]}>
          <Field label="SEARCH" value={q} onChangeText={setQ} placeholder="Type a name" />
          <FlatList data={list} keyExtractor={(i) => i.employeeId} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => { onPick(item); setOpen(false); setQ(''); }} style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: C.line }}>
                <Text style={{ fontWeight: '600', color: C.ink }}>{item.name}</Text>
                <Text style={{ color: C.mute, fontSize: 12 }}>{[item.designation, item.departmentName].filter(Boolean).join(' · ')}</Text>
              </Pressable>)} />
          <Button title="Close" color={C.soft} onPress={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function DateField({ label, value, onChange, min }: { label: string; value: Date | null; onChange: (d: Date) => void; min?: Date | null }) {
  const [show, setShow] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setShow(true)} style={s.input}><Text style={{ color: value ? C.ink : '#9CA3AF' }}>{value ? ymd(value) : 'Select date'}</Text></Pressable>
      {show && <DateTimePicker value={value ?? min ?? new Date()} minimumDate={min ?? undefined} mode="date" onChange={(_, d) => { setShow(Platform.OS === 'ios'); if (d) onChange(d); }} />}
    </View>
  );
}

function LeaveScreen({ sess, staff }: { sess: api.Session; staff: Employee[] }) {
  const e = sess.employee;
  const [from, setFrom] = useState<Date | null>(null); const [to, setTo] = useState<Date | null>(null);
  const [reason, setReason] = useState(''); const [hod, setHod] = useState<Employee | null>(null); const [sub, setSub] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false); const [leaves, setLeaves] = useState<Leave[]>([]);
  const load = useCallback(() => { api.myLeaves().then(setLeaves).catch(() => {}); }, []);
  useEffect(load, [load]);
  const others = staff.filter((x) => x.employeeId !== e?.employeeId);

  const submit = async () => {
    if (!e) return notify('No profile', 'No employee profile is linked to this login.');
    if (!from || !to) return notify('Select dates', 'Please select From date and To date.');
    if (to < from) return notify('Check dates', 'To date cannot be before From date.');
    if (!reason.trim() || !hod || !sub) return notify('Missing details', 'Fill reason, HOD and substitute.');
    setBusy(true);
    try {
      await api.submitLeave({ fromDate: ymd(from), toDate: ymd(to), reason: reason.trim(), hodName: hod.name, hodId: hod.employeeId, substitute: sub.name });
      notify('Submitted', 'Leave sent for approval.'); setReason(''); setHod(null); setSub(null); setFrom(null); setTo(null); load();
    } catch (er: any) { notify('Error', er.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Text style={s.h1}>Apply for Leave</Text><Text style={s.sub}>Submitting as {e?.name || sess.user.name}</Text>
      <Field label="EMPLOYEE" value={e?.name || ''} editable={false} />
      <Field label="DEPARTMENT" value={e?.departmentName || ''} editable={false} />
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
        <DateField label="FROM DATE" value={from} onChange={(d) => { setFrom(d); if (to && to < d) setTo(null); }} />
        <DateField label="TO DATE" value={to} onChange={setTo} min={from} />
      </View>
      <Field label="REASON FOR LEAVE" value={reason} onChangeText={setReason} multiline placeholder="Describe the reason for your leave..." />
      <Picker label="HOD / MANAGER" value={hod?.name || ''} options={others} onPick={setHod} placeholder="Select reporting manager..." />
      <Picker label="SUBSTITUTE" value={sub?.name || ''} options={others} onPick={setSub} placeholder="Colleague who will cover" />
      <Button title="Submit Application" onPress={submit} loading={busy} />
      <Text style={[s.label, { marginTop: 28 }]}>MY LEAVES</Text>
      {leaves.length === 0 && <Text style={{ color: C.mute }}>No applications yet.</Text>}
      {leaves.map((l) => (
        <View key={l.id} style={[s.card, { marginTop: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: C.ink }}>{l.fromDate} → {l.toDate}</Text>
            <Text style={[s.badge, { color: statusColor(l.status) }]}>{l.status}</Text>
          </View>
          <Text style={{ color: C.mute, marginTop: 4 }}>{l.reason}</Text>
        </View>))}
    </ScrollView>
  );
}
