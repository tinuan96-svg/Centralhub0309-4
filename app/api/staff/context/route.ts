import {requireStaffContext,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(request:Request){
  try{
    const context=await requireStaffContext(request);
    const query=context.admin.from('stores').select('id,name,slug').order('name');
    const {data:stores,error}=context.allStores?await query:await query.in('id',context.storeIds);
    if(error)throw error;
    return Response.json({role:context.role,full_name:context.fullName,
      permissions:context.permissions,stores:stores||[],activation:'manual'},
      {headers:{'Cache-Control':'no-store, private'}});
  }catch(error){return staffErrorResponse(error);}
}
