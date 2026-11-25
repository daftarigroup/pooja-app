import * as SS from 'expo-secure-store';
import { Platform } from 'react-native';

// SecureStore has no web support: fall back to localStorage there (browser preview only).
const SecureStore = {
  getItemAsync: async (k: string) => (Platform.OS === 'web' ? localStorage.getItem(k) : SS.getItemAsync(k)),
  setItemAsync: async (k: string, v: string) => { if (Platform.OS === 'web') localStorage.setItem(k, v); else await SS.setItemAsync(k, v); },
  deleteItemAsync: async (k: string) => { if (Platform.OS === 'web') localStorage.removeItem(k); else await SS.deleteItemAsync(k); },
};

// Same backend as the web app. Phone cannot reach "localhost": set EXPO_PUBLIC_API_URL
// (production: https://api.daftarigroup.com/api; local dev: put your LAN URL in .env.local).
export const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.daftarigroup.com/api';

export type Employee = {
  id: string; employeeId: string; empCode?: string; name: string; phone?: string; email?: string;
  designation?: string; userId?: string | null; departmentId?: string | number | null;
  departmentName?: string; department?: any;
};
export type Session = { token: string; user: any; employee: Employee | null };
export type Leave = {
  id: number; fromDate: string; toDate: string; days: number | null; reason: string; status: string; hodName: string;
};

// No cookies on a phone: the JWT is kept in the OS keystore (SecureStore) and sent as a Bearer header.
const KEY = 'session';
let session: Session | null = null;
export const getSession = () => session;
export async function loadSession() {
  const raw = await SecureStore.getItemAsync(KEY);
  session = raw ? JSON.parse(raw) : null;
  return session;
}
async function saveSession(s: Session | null) {
  session = s;
  if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEY);
}
export const logout = () => saveSession(null);

let onUnauthorized: () => void = () => {};
export const setOnUnauthorized = (fn: () => void) => { onUnauthorized = fn; };

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(API_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) { if (session) { await logout(); onUnauthorized(); } }
  if (!res.ok) {
    const issues = json?.errors?.[0]?.message;
    throw new Error(issues || json?.message || `Request failed (${res.status})`);
  }
  return json;
}

// The endpoint returns full employee rows; keep only what the app needs (small, nothing sensitive stored on the phone).
export const listEmployees = async (): Promise<Employee[]> =>
  ((await req('GET', '/hr/employees?status=active')).data || []).map((e: any) => ({
    id: e.id, employeeId: e.employeeId, empCode: e.empCode, name: e.name, phone: e.phone, email: e.email,
    designation: e.designation, userId: e.userId, departmentId: e.departmentId, departmentName: e.departmentName,
  }));

export async function login(username: string, password: string) {
  const r = await req('POST', '/store/users/authenticate', { username, password });
  await saveSession({ token: r.checklistToken, user: r.data, employee: null });
  const emps = await listEmployees();
  const employee = emps.find((e) => e.userId && String(e.userId) === String(r.data.id)) || null;
  await saveSession({ token: r.checklistToken, user: r.data, employee });
  return { session: session!, employees: emps };
}

const empId = () => {
  const id = session?.employee?.employeeId;
  if (!id) throw new Error('No employee profile is linked to this login. Contact HR.');
  return id;
};

const pad = (n: number) => String(n).padStart(2, '0');
// Device-local date/time (the server may run in another timezone, so we send both explicitly).
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export type PunchType = 'in' | 'out' | 'half_day';

// Same flow as the web kiosk: presign -> PUT photo to S3 -> record the punch (photo + GPS are mandatory).
async function uploadPhoto(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  const type = 'image/jpeg';
  const p = await req('POST', '/hr/upload/presign', { bucket: 'attendance-punches', path: `${empId()}/${Date.now()}.jpg`, contentType: type });
  const { uploadUrl, publicUrl } = p.data || {};
  if (!uploadUrl || !publicUrl) throw new Error('Could not get an upload URL from the server.');
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': type }, body: blob });
  if (!put.ok) throw new Error(`Photo upload failed (${put.status}).`);
  return publicUrl;
}

export async function punch(punchType: PunchType, photoUri: string, lat: number, lng: number, address?: string) {
  const photoUrl = await uploadPhoto(photoUri);
  const now = new Date();
  return req('POST', '/hr/attendance/self-punch', {
    punchType, photoUrl, latitude: lat, longitude: lng, date: localDate(now), time: localTime(now), notes: address || null,
  });
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const j = await r.json();
    return [j.locality, j.city, j.principalSubdivision, j.postcode].filter(Boolean).join(', ');
  } catch { return ''; }
}

export async function todayAttendance() {
  const d = new Date();
  const r = await req('GET', `/hr/attendance/monthly?employeeId=${empId()}&year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
  return (r.data as any[]).find((a) => a.date === localDate(d)) || null;
}

// Whole month for the logged-in employee only (the id always comes from the session, never from user input).
export async function monthAttendance(year: number, month: number): Promise<any[]> {
  return (await req('GET', `/hr/attendance/monthly?employeeId=${empId()}&year=${year}&month=${month}`)).data || [];
}

export const myLeaves = async (): Promise<Leave[]> => (await req('GET', `/hr/leave/employee/${empId()}`)).data || [];
export const submitLeave = (p: { fromDate: string; toDate: string; reason: string; hodName: string; hodId?: string; substitute: string }) => {
  const e = session!.employee!;
  return req('POST', '/hr/leave/submit', {
    ...p, employeeId: e.employeeId, employeeName: e.name,
    departmentId: e.departmentId ?? null,
  });
};
