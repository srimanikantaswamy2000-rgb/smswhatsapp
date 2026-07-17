import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * GET /api/reports — list the daily lead-report PDFs in the public
 * `reports` storage bucket, newest first. Objects are named
 * `lead-report-YYYY-MM-DD.pdf` by the cron, so the date comes straight
 * from the filename. Requires a logged-in dashboard user.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = supabaseAdmin()
  const { data: objects, error } = await db.storage.from('reports').list('', {
    limit: 1000,
    sortBy: { column: 'name', order: 'desc' },
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const reports = (objects ?? [])
    .filter((o) => /^lead-report-\d{4}-\d{2}-\d{2}\.pdf$/.test(o.name))
    .map((o) => ({
      date: o.name.slice('lead-report-'.length, -'.pdf'.length),
      name: o.name,
      url: db.storage.from('reports').getPublicUrl(o.name).data.publicUrl,
      updatedAt: o.updated_at ?? o.created_at ?? null,
      size: (o.metadata as { size?: number } | null)?.size ?? null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  return NextResponse.json({ reports })
}
