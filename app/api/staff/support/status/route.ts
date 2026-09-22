import {
  StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse
} from '@/lib/access-control/staff';

export const dynamic='force-dynamic';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES=new Set(['open','in_progress','resolved','closed']);

/** Status-only workflow. No arbitrary table/field updates or financial effects.
 * The service-role RPC revalidates the staff actor and assigned store *again*
 * in the same database transaction as the status mutation + audit insert.
 */
export async function POST(request:Request){
  try{
    const context=await requireStaffContext(request);
    const payload=await request.json().catch(()=>null) as Record<string,unknown>|null;
    const ticketId=payload?.ticket_id;
    const storeId=payload?.store_id;
    const expected=payload?.expected_status;
    const next=payload?.next_status;
    if(typeof ticketId!=='string'||!UUID.test(ticketId)||
      typeof storeId!=='string'||!UUID.test(storeId)||
      typeof expected!=='string'||!STATUSES.has(expected)||
      typeof next!=='string'||!STATUSES.has(next)||expected===next){
      throw new StaffAccessDenied('Invalid ticket, store or status transition',400);
    }
    requireStaffPermission(context,'support.view',storeId);
    requireStaffPermission(context,'support.edit',storeId);

    const {data,error}=await context.admin.rpc('ch_staff_change_support_status',{
      p_actor:context.userId,p_ticket_id:ticketId,p_store_id:storeId,
      p_expected_status:expected,p_next_status:next
    });
    if(error){
      if(error.code==='42501')throw new StaffAccessDenied('Support access is no longer assigned',403);
      if(error.code==='P0002')throw new StaffAccessDenied('Ticket changed or is unavailable for this store. Refresh and retry.',409);
      if(error.code==='22023')throw new StaffAccessDenied('Invalid ticket status',400);
      throw error;
    }
    if(data!==ticketId)throw new Error('Unexpected ticket update result');
    return Response.json({success:true,ticket_id:ticketId,status:next},{
      headers:{'Cache-Control':'no-store, private'}
    });
  }catch(error){return staffErrorResponse(error);}
}
