import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import {
  listServiceRequests,
  type ServiceRequestStatus,
} from '@/lib/service-requests/queries'

// Service complaints captured by the bot (RLS-scoped by user_id, see
// migration 047_service_requests.sql). GET lists (optionally filtered
// by ?status=).

export async function GET(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()
    const { searchParams } = new URL(request.url)
    const status = (searchParams.get('status') ?? undefined) as
      | ServiceRequestStatus
      | undefined
    const serviceRequests = await listServiceRequests(supabase, { status })
    return NextResponse.json({ serviceRequests })
  } catch (err) {
    return toErrorResponse(err)
  }
}
