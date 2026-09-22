import {StaffAccessDenied,requireStaffContext,requireStaffPermission,staffErrorResponse} from '@/lib/access-control/staff';
export const dynamic='force-dynamic';
export const runtime='nodejs';

const resources={
  orders:{permission:'orders.view',table:'orders',columns:'id,store_id,order_number,customer_name,order_status,payment_status,total,created_at'},
  customers:{permission:'customers.view',table:'customers',columns:'id,store_id,name,email,phone,created_at'},
  customer_care:{permission:'support.view',table:'support_tickets',columns:'id,store_id,subject,description,status,created_at'},
  billing:{permission:'billing.view',table:'finance_documents',columns:'id,store_id,invoice_number,subject,created_at'},
  finance:{permission:'finance.view',table:'bank_transactions',columns:'id,store_id,description,amount,created_at'},
  marketing:{permission:'marketing.view',table:'marketing_campaigns',columns:'id,store_id,name,status,created_at'}
} as const;
type Resource=keyof typeof resources;
export async function GET(request:Request){
  try{
    const url=new URL(request.url);
    const section=url.searchParams.get('section')||'';
    if(!Object.prototype.hasOwnProperty.call(resources,section))
      throw new StaffAccessDenied('This section is not currently available to staff',404);
    const storeId=url.searchParams.get('store_id')||'';
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storeId))
      throw new StaffAccessDenied('Select a valid store',400);
    const rawPage=Number(url.searchParams.get('page')||'1');
    if(!Number.isInteger(rawPage)||rawPage<1||rawPage>10000)
      throw new StaffAccessDenied('Invalid page',400);
    const context=await requireStaffContext(request);
    const resource=resources[section as Resource];
    requireStaffPermission(context,resource.permission,storeId);
    // No select(*), client-controlled table names, client-provided column lists
    // or unscoped queries. More complex business actions have separate routes.
    const {data,error,count}=await context.admin.from(resource.table)
      .select(resource.columns,{count:'exact'})
      .eq('store_id',storeId)
      .order('created_at',{ascending:false})
      .range((rawPage-1)*50,rawPage*50-1);
    if(error)throw error;
    return Response.json({section,store_id:storeId,page:rawPage,total:count||0,rows:data||[]},
      {headers:{'Cache-Control':'no-store, private'}});
  }catch(error){return staffErrorResponse(error);}
}
