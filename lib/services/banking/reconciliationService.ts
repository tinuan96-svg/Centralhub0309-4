import { supabase } from '@/lib/supabase';
import { OrderWithItems } from '@/lib/types';

export interface PayoutReconciliation { id:string; bank_transaction_id:string; order_id:string; amount_allocated:number; fee_allocated:number; created_at:string; }

export class ReconciliationService {
  static async applyGatewayFee(orderId:string):Promise<number>{try{const {data:order,error}=await supabase.from('orders').select('*, stores(slug)').eq('id',orderId).single();if(error||!order)return 0;const slug=(order as any).stores?.slug;let gatewayName='Unknown',percentage=2,fixed=.2;if(slug==='malluspices'){gatewayName='Mollie';percentage=1.8}else if(slug==='keralagrocery'||slug==='keralagroceries'){gatewayName='Trust Payments';percentage=2}const total=Number(order.total)||0,fee=total*(percentage/100)+fixed;await supabase.from('orders').update({gateway_name:gatewayName,gateway_fee_net:fee,gateway_fee_estimated:fee,expected_payout:total-fee,updated_at:new Date().toISOString()}).eq('id',orderId);return fee}catch(err){console.error('[ReconciliationService] Error applying gateway fee:',err);return 0}}

  static async findMatchingOrders(transactionId:string):Promise<OrderWithItems[]>{const {data:tx}=await supabase.from('bank_transactions').select('*').eq('id',transactionId).single();if(!tx)return [];const txDate=new Date(tx.transaction_date),startDate=new Date(txDate);startDate.setDate(startDate.getDate()-7);const {data:orders}=await supabase.from('orders').select('*, stores(name)').eq('payment_status','paid').is('payout_status','pending').gte('created_at',startDate.toISOString()).lte('created_at',tx.transaction_date).order('created_at',{ascending:false});return(orders||[]) as OrderWithItems[]}

  static async reconcileOrdersWithTx(params:{transactionId:string;orderIds:string[];fees:Record<string,number>}):Promise<{success:boolean;error?:string}>{try{
    // Mark the bank receipt reconciled before reserve allocation. The allocation RPC accepts only a
    // reconciled receipt, and is idempotent per bank transaction/order.
    const {error:bankError}=await supabase.from('bank_transactions').update({is_reconciled:true,reconciliation_status:'reconciled',updated_at:new Date().toISOString()}).eq('id',params.transactionId);if(bankError)throw bankError;
    for(const orderId of params.orderIds){const {data:order}=await supabase.from('orders').select('total').eq('id',orderId).single();if(!order)continue;const fee=params.fees[orderId]||0,allocated=Number(order.total)-fee;const {error:recError}=await supabase.from('payout_reconciliations').insert({bank_transaction_id:params.transactionId,order_id:orderId,amount_allocated:allocated,fee_allocated:fee});if(recError)throw recError;const {error:orderError}=await supabase.from('orders').update({payout_status:'settled',gateway_fee_actual:fee,actual_payout:allocated,updated_at:new Date().toISOString()}).eq('id',orderId);if(orderError)throw orderError;const {error:reserveError}=await supabase.rpc('allocate_reserves_for_reconciled_sale',{p_bank_transaction_id:params.transactionId,p_order_id:orderId});if(reserveError)throw reserveError}
    return{success:true}
  }catch(err:any){return{success:false,error:err.message}}}
}
