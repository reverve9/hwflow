/**
 * auth.ts — Supabase 인증 (멀티테넌트)
 */

import { supabase } from './supabase'
import type { User } from '@supabase/supabase-js'

export interface Profile {
  id: string
  email: string
  display_name: string | null
  tenant_id: string | null
  role: 'admin' | 'member'
  approved: boolean
}

/** 회원가입 */
export async function signUp(email: string, password: string, displayName?: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { display_name: displayName ?? '' } },
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** 로그인 */
export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** 로그아웃 */
export async function logout() {
  await supabase.auth.signOut()
}

/** 현재 유저 */
export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  return data.user
}

/** 프로필 조회 */
export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.auth.getSession()
  if (!data.session) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return profile
}

/** 인증 상태 변경 구독 */
export function onAuthChange(callback: (user: User | null) => void) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return subscription
}
