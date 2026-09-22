import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(request:Request){
 try{
  const context=await requireStaffContext(request);
  const url=new URL(request.url);
  const orderId=url.searchParams.get('order_id')||'';
  const storeId=url.searchParams.get('store_id')||'';
  if(!UUID.test(orderId)||!UUID.test(storeId))throw new StaffAccessDenied('Invalid order or store',400);
  requireStaffPermission(context,'fulfilment.view',storeId);
  requireStaffPermission(context,'fulfilment.pick',storeId);
  const {data:order,error:orderError}=await context.admin.from('orders')
    .select('id,store_id,warehouse_status,order_status,payment_status,locked_by,picked_by_user,picking_started_at')
    .eq('id',orderId).eq('store_id',storeId).maybeSingle();
  if(orderError)throw orderError;
  if(!order||order.locked_by!==context.userId||order.picked_by_user!==context.userId||
    order.warehouse_status!=='picking'||order.payment_status!=='paid'){
    throw new StaffAccessDenied('This picking session is not assigned to you',403);
  }
  const {data:items,error:itemsError}=await context.admin.from('order_items')
    .select('id,product_name,sku,quantity,picked_quantity,skip_reason')
    .eq('order_id',orderId).order('created_at',{ascending:true}).limit(150);
  if(itemsError)throw itemsError;
  if(!items?.length)throw new StaffAccessDenied('This order has no mapped picking lines. Ask your manager to review it.',409);
  return Response.json({order,items},{headers:{'Cache-Control':'no-store, private'}});
 }catch(error){return staffErrorResponse(error);}
}
export async function POST(request:Request){
 try{
  const context=await requireStaffContext(request);
  const payload=await request.json().catch(()=>null) as Record<string,unknown>|null;
  const orderId=payload?.order_id,storeId=payload?.store_id,itemId=payload?.order_item_id,barcode=payload?.barcode;
  if(typeof orderId!=='string'||!UUID.test(orderId)||typeof storeId!=='string'||!UUID.test(storeId)||
     typeof itemId!=='string'||!UUID.test(itemId)||typeof barcode!=='string'||
     barcode.trim().length<3||barcode.trim().length>64){
    throw new StaffAccessDenied('Select a valid assigned item and scan its product barcode',400);
  }
  requireStaffPermission(context,'fulfilment.view',storeId);
  requireStaffPermission(context,'fulfilment.pick',storeId);
  const {data,error}=await context.admin.rpc('ch_staff_scan_picking_item',{
    p_actor:context.userId,p_order_id:orderId,p_store_id:storeId,
    p_order_item_id:itemId,p_barcode:barcode.trim()
  });
  if(error){
    if(error.code==='42501')throw new StaffAccessDenied('Picking permission or store access has been revoked',403);
    if(error.code==='P0002')throw new StaffAccessDenied('This item or picking session is no longer available',409);
    if(error.code==='23514')throw new StaffAccessDenied('Barcode mismatch or order lines need manager review',409);
    if(error.code==='22023')throw new StaffAccessDenied('Invalid barcode or item',400);
    throw error;
  }
  if(!Number.isInteger(data)||data<1)throw new Error('Unexpected scan result');
  return Response.json({success:true,order_item_id:itemId,picked_quantity:data},{
    headers:{'Cache-Control':'no-store, private'}
  });
 }catch(error){return staffErrorResponse(error);}
}
