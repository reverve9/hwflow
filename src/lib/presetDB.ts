/**
 * presetDB.ts — Supabase 프리셋 저장/로드
 */

import { supabase } from './supabase'
import type { StylePreset } from '@/store/types'

export interface DBPreset {
  id: string
  name: string
  tenant_id: string | null
  data: StylePreset
  created_at: string
}

/** DB에서 프리셋 목록 로드 (공용 + 소속 테넌트) */
export async function loadPresetsFromDB(): Promise<DBPreset[]> {
  const { data, error } = await supabase.rpc('list_presets')
  if (error) { console.error('[HWFlow] loadPresetsFromDB:', error); return [] }
  return data ?? []
}

/** DB에 프리셋 저장 */
export async function savePresetToDB(
  name: string,
  presetData: StylePreset,
  tenantId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('save_preset', {
    preset_name: name,
    preset_data: presetData,
    preset_tenant_id: tenantId ?? null,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** DB 프리셋 삭제 */
export async function deletePresetFromDB(presetId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('delete_preset', { preset_id: presetId })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
