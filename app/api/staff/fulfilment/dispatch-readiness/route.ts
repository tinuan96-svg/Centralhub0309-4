import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read-only pre-dispatch evidence check. This endpoint never contacts DHL,
 * books a shipment, changes order/stock/status, or sends store notifications.
 * A separate reviewed and audited action is needed for physical handover.
 */
export async function GET(request:Request){
  try{
    const context=await requireStaffContext(request);
    const url=new URL(request.url);
    const orderId=url.searchParams.get('order_id')||'';
    const storeId=url.searchParams.get('store_id')||'';
    if(!UUID.test(orderId)||!UUID.test(storeId))
      throw new StaffAccessDenied('Select a valid order and assigned store',400);
    requireStaffPermission(context,'fulfilment.view',storeId);
    requireStaffPermission(context,'shipping.view',storeId);
    requireStaffPermission(context,'fulfilment.dispatch',storeId);

    const {data:order,error:orderError}=await context.admin.from('orders')
      .select('id,store_id,order_number,order_status,warehouse_status,payment_status,is_deleted')
      .eq('id',orderId).eq('store_id',storeId).maybeSingle();
    if(orderError)throw orderError;
    if(!order)throw new StaffAccessDenied('Order is not available for your store',404);

    // Fetch shipment evidence ONLY after checking the order/store boundary.
    // Do not return addresses, telephone numbers, private label URLs or cost.
    const {data:shipments,error:shipmentError}=await context.admin.from('shipments')
      .select('id,carrier,status,tracking_number,label_printed,created_at')
      .eq('order_id',orderId).order('created_at',{ascending:false}).limit(20);
    if(shipmentError)throw shipmentError;
    const active=(shipments||[]).filter(s=>
      s.status==='label_created'||s.status==='ready_to_ship');
    const issues:string[]=[];
    if(order.is_deleted)issues.push('This order is deleted.');
    if(order.payment_status!=='paid')issues.push('Payment has not been verified as paid.');
    if(order.warehouse_status==='dispatched'||order.order_status==='shipment_booked')
      issues.push('The existing shipment workflow has already advanced the order at booking. A manager must verify physical courier handover; staff dispatch cannot be recorded here.');
    else if(order.warehouse_status!=='packed'||
       !['packed','ready_to_ship'].includes(order.order_status))
      issues.push('Picking and barcode-verified packing must be completed.');
    if(!active.length)issues.push('No active booked shipment or shipping label is recorded.');
    if(active.length>1||shipments?.length===20)
      issues.push('Multiple shipment records need manager review before handover.');
    const shipment=active.length===1?active[0]:null;
    if(shipment&&shipment.status!=='label_created')
      issues.push('Shipment booking is not complete; a created shipping label is required.');
    if(shipment&&!shipment.tracking_number?.trim())
      issues.push('The booked shipment has no tracking number.');
    if(shipment&&shipment.label_printed!==true)
      issues.push('The shipping label has not been confirmed as printed.');

    return Response.json({
      order_id:order.id,store_id:storeId,order_number:order.order_number,
      ready_for_handover:issues.length===0,
      issues,shipment:shipment?{
        id:shipment.id,carrier:shipment.carrier,status:shipment.status,
        tracking_number:shipment.tracking_number,label_printed:shipment.label_printed
      }:null,
      dispatch_action_available:false
    },{headers:{'Cache-Control':'no-store, private','Vary':'Authorization'}});
  }catch(error){return staffErrorResponse(error);}
}
