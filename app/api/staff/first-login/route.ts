import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fail(message: string, status: number) {
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
}

/** A newly provisioned staff member changes the Super Admin-generated one-time
 * password here. This endpoint NEVER activates the account or grants access. */
export async function POST(request: Request) {
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer ')) return fail('Sign in required',401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret=process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !anon || !secret) return fail('Service not configured',503);

  const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await client.auth.getUser(authorization.slice(7));
  if(authError || !user) return fail('Invalid session',401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:identityError}=await admin.auth.admin.getUserById(user.id);
  if(identityError || !identity.user || identity.user.app_metadata?.role!=='staff' ||
      identity.user.app_metadata?.must_change_password!==true) {
    return fail('Password setup is not available for this account',403);
  }
  const {data:staff,error:staffError}=await admin.from('ch_staff_accounts')
    .select('status').eq('user_id',user.id).maybeSingle();
  if(staffError || !staff || staff.status==='active') return fail('Account is not eligible for password setup',403);

  let submitted:unknown;
  try {submitted=await request.json();}catch{return fail('Invalid request',400);}
  const password=typeof (submitted as {password?:unknown})?.password==='string'
    ? (submitted as {password:string}).password : '';
  if(password.length<14 || password.length>128 ||
      password.trim()!==password || /[\x00-\x1f]/.test(password) ||
      (identity.user.email && password.toLowerCase().includes(identity.user.email.toLowerCase()))) {
    return fail('Use a different password containing 14–128 characters, without control characters or surrounding spaces.',400);
  }
  // Updating the Auth password and trusted flag together avoids a client being
  // able to claim that it changed its password without actually doing so.
  const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{
    password,
    app_metadata:{...identity.user.app_metadata,role:'staff',must_change_password:false}
  });
  if(updateError) return fail('Could not update password',503);
  // Re-authenticate with the new password. No staff data is returned here.
  return NextResponse.json({success:true,account_status:staff.status,activation:'super_admin_required'},
    {headers:{'Cache-Control':'no-store, private'}});
}
