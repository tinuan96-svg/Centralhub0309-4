export type StaffAccessSnapshot={
  active:boolean; status:'pending'|'active'|'suspended'; role_key:string;
  must_change_password:boolean; all_stores:boolean; store_ids:string[]; permissions:string[];
};
const prefixRules:Array<[string,string[]]>=[
  ['/settings/users',['users.view']], ['/settings',['settings.view']],
  ['/site-health',['security.view']], ['/developer',['security.view']],
  ['/orders',['orders.view']], ['/customers',['customers.view']],
  ['/customer-care',['support.view']], ['/picking',['fulfilment.view']], ['/packing',['fulfilment.view']],
  ['/shipping',['shipping.view']], ['/procurement',['procurement.view']], ['/backorder-planning',['procurement.view']],
  ['/suppliers',['procurement.view']], ['/inventory-management/purchase-orders',['procurement.view']],
  ['/inventory-management/grn',['procurement.view']], ['/inventory-audit',['inventory.audit']],
  ['/inventory-management',['inventory.view']], ['/inventory',['products.view','inventory.view']],
  ['/pricing',['pricing.view']], ['/marketing',['marketing.view']],
  ['/analytics',['analytics.view']], ['/business-intelligence',['analytics.view']],
  ['/competitors',['pricing.view']], ['/banking',['finance.view']], ['/expenses',['finance.view']],
  ['/profit-analysis',['finance.view']], ['/finance',['finance.view']],
  ['/stores',['stores.view']], ['/sync-status',['orders.view']], ['/dashboard',['dashboard.view']],
];
export function requiredPermissionsForPath(pathname:string):string[]{
  const match=prefixRules.find(([prefix])=>pathname===prefix||pathname.startsWith(prefix+'/')||pathname.startsWith(prefix+'?'));
  return match?.[1]||[];
}
export function staffCanOpenPath(pathname:string,permissions:string[]):boolean{
  const required=requiredPermissionsForPath(pathname);
  return required.length>0 && required.some(permission=>permissions.includes(permission));
}
