import {NextResponse} from 'next/server';
import {AccessDenied,requireVerifiedSuperAdmin} from '@/lib/access-control/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Small, no-store server check. A signed-in account without an ACTIVE verified
 * Super Admin identity must never be handed the privileged legacy workspace.
 */
export async function GET(request:Request){
  try{
    await requireVerifiedSuperAdmin(request);
    return NextResponse.json({verified:true},{headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
  }catch(error){
    const status=error instanceof AccessDenied?error.status:503;
    return NextResponse.json({verified:false},{status,headers:{'Cache-Control':'no-store, private'}});
  }
}
