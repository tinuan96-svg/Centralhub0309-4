import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
}

function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
}

function getServiceRoleKey() {
  return (
    process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

export function getAnonClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey());
}

export function getServiceClient() {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error('Missing Supabase service-role key for the CentralHub server route.');
  }

  return createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function jsonError(error: string, status = 400, details?: unknown) {
  return NextResponse.json({ success: false, error, details }, { status });
}

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1];

  if (!token) {
    return { user: null, error: 'Missing user session token.' };
  }

  const { data, error } = await getAnonClient().auth.getUser(token);

  if (error || !data.user) {
    return { user: null, error: 'Invalid or expired user session.' };
  }

  return { user: data.user, error: null };
}
