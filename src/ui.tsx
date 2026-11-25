import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput, Pressable, View, StyleSheet, ActivityIndicator, TextInputProps } from 'react-native';

export const C = { bg: '#FFFFFF', ink: '#111827', mute: '#6B7280', line: '#E5E7EB', amber: '#F59E0B', amberBg: '#FEF3C7', green: '#16A34A', red: '#DC2626', soft: '#F9FAFB' };

export const Button = ({ title, onPress, loading, color = C.amber, textColor = C.ink, disabled }: any) => (
  <Pressable onPress={onPress} disabled={loading || disabled} style={[s.btn, { backgroundColor: color, opacity: disabled ? 0.5 : 1 }]}>
    {loading ? <ActivityIndicator color={textColor} /> : <Text style={[s.btnT, { color: textColor }]}>{title}</Text>}
  </Pressable>
);
export const Field = ({ label, ...p }: TextInputProps & { label: string }) => {
  // Password fields get a show/hide eye so the typed value can be checked.
  const [hidden, setHidden] = useState(true);
  const isPwd = !!p.secureTextEntry;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <View>
        <TextInput placeholderTextColor="#9CA3AF" {...p} secureTextEntry={isPwd && hidden} style={[s.input, p.multiline && { height: 90, textAlignVertical: 'top' }, isPwd && { paddingRight: 46 }]} />
        {isPwd && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={22} color="#6B7280" />
          </Pressable>
        )}
      </View>
    </View>
  );
};
export const Row = ({ k, v }: { k: string; v?: string | null }) => (
  <View style={s.row}><Text style={s.k}>{k}</Text><Text style={s.v}>{v || '—'}</Text></View>
);
export const statusColor = (st?: string) => (st === 'approved' || st === 'present' ? C.green : st === 'rejected' || st === 'absent' ? C.red : C.amber);

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  pad: { padding: 20 },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink },
  sub: { color: C.mute, marginTop: 2, marginBottom: 16 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnT: { fontWeight: '700', fontSize: 16 },
  label: { fontSize: 12, fontWeight: '700', color: C.mute, marginBottom: 6, letterSpacing: 0.5 },
  input: { backgroundColor: C.soft, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, height: 46, color: C.ink, fontSize: 15, justifyContent: 'center' },
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 16, backgroundColor: C.bg, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  k: { color: C.mute }, v: { color: C.ink, fontWeight: '600', maxWidth: '65%', textAlign: 'right' },
  badge: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
});
