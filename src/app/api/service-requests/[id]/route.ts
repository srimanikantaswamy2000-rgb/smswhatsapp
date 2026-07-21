import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import {
  setServiceRequestStatus,
  type ServiceRequestStatus,
} from '@/lib/service-requests/queries'

const VALID: ServiceRequestStatus[] = [
  'pending',
  'contacted',
  'resolved',
  'cancelled',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await getCurrentAccount()
    const { id } = await params
    const body = await request.json().catch(() => null)
    const status = body?.status as ServiceRequestStatus | undefined
    if (!status || !VALID.includes(status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    await setServiceRequestStatus(supabase, id, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
