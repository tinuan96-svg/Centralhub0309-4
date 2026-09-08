import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.101.0";

const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS" };
const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const n = (value:unknown)=>Number(value||0);

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")||"", anon=Deno.env.get("SUPABASE_ANON_KEY")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
    const authorization=req.headers.get("Authorization")||"";
    if(!authorization.startsWith("Bearer ")) return json({error:"Authentication required"},401);
    const userDb=createClient(url,anon,{global:{headers:{Authorization:authorization}}});
    const {data:userData,error:userError}=await userDb.auth.getUser(authorization.slice(7));
    if(userError||!userData.user) return json({error:"Invalid session"},401);
    const {data:admin}=await userDb.rpc("is_admin");
    if(admin!==true) return json({error:"Admin access required"},403);

    const db=createClient(url,service); const body=await req.json(); const action=body.action;
    if(!["analyze_project","prioritize_portfolio"].includes(action)) return json({error:"Unsupported action"},400);
    const [{data:baseline},{data:projects,error:projectError}]=await Promise.all([
      db.from("v_financial_planning_baseline").select("*").maybeSingle(),
      db.from("financial_plan_projects").select("*").not("status","in","(completed,cancelled)").order("priority_score",{ascending:false}),
    ]);
    if(projectError) throw projectError;
    const confidence=Math.min(1,n(baseline?.data_confidence_pct)/100);
    const cash=n(baseline?.bank_balance)+n(baseline?.reserve_available);

    if(action==="analyze_project"){
      const p=projects?.find((item:any)=>item.id===body.project_id); if(!p)return json({error:"Project not found"},404);
      const monthlyBenefit=n(p.expected_monthly_revenue)+n(p.expected_monthly_savings);
      const payback=monthlyBenefit>0?n(p.estimated_cost)/monthlyBenefit:null;
      const roi=n(p.estimated_cost)>0?((monthlyBenefit*12-n(p.estimated_cost))/n(p.estimated_cost))*100:0;
      const cover=n(p.estimated_cost)>0?cash/n(p.estimated_cost):1;
      const risks:string[]=[]; const assumptions:string[]=[]; const next:string[]=[];
      if(confidence<0.7) risks.push("Finance data is not sufficiently reconciled for a high-confidence commitment");
      if(n(p.risk_level)>=4) risks.push("The project is marked high risk");
      if(cover<1) risks.push("Current bank balance and available reserves do not cover the estimated cost");
      if(monthlyBenefit<=0) risks.push("No measurable monthly revenue or savings benefit has been entered");
      if(!p.target_start_date||!p.target_end_date) risks.push("Implementation dates are incomplete");
      assumptions.push("Entered cost, revenue and savings estimates are accurate and exclude unrecorded liabilities");
      assumptions.push("Growth and Marketing Reserve rules remain restricted to reconciled receipts");
      if(confidence<0.7) next.push("Improve bank reconciliation and order cost coverage before final funding approval");
      if(cover<1) next.push("Assign a funding source or phase the project to remove the funding gap");
      if(monthlyBenefit<=0) next.push("Add a measurable revenue or savings target");
      next.push("Validate supplier quotes, dependencies and milestones before changing status to approved");
      let recommendation="PROCEED";
      if(monthlyBenefit<=0||confidence<0.4) recommendation="VALIDATE_FIRST";
      else if((payback!==null&&payback>24)||n(p.risk_level)>=5) recommendation="DEFER";
      else if(roi<0&&n(p.strategic_impact)<4) recommendation="REJECT";
      else if(confidence<0.7||cover<1) recommendation="VALIDATE_FIRST";
      const rationale=`Estimated ${payback===null?'payback is not measurable':`payback is ${payback.toFixed(1)} months`} and 12-month return is ${roi.toFixed(1)}%. Funding cover is ${(cover*100).toFixed(0)}%. ${confidence<0.7?'The recommendation is deliberately cautious because finance-data confidence is low.':'Recorded data supports a higher-confidence assessment.'}`;
      const analysis={recommendation,rationale,confidence:Math.min(confidence,0.95),risk_flags:risks,assumptions,next_actions:next};
      const {error:updateError}=await db.from("financial_plan_projects").update({ai_recommendation:recommendation,ai_rationale:rationale,ai_confidence:analysis.confidence,ai_risk_flags:risks,ai_assumptions:assumptions,ai_analyzed_at:new Date().toISOString()}).eq("id",p.id);
      if(updateError)throw updateError;
      await db.from("financial_plan_ai_runs").insert({project_id:p.id,analysis_type:"project",input_snapshot:{project_id:p.id,baseline_confidence:confidence},output:analysis,model:"centralhub-planning-engine-v1",created_by:userData.user.id});
      return json({analysis});
    }

    const ranked=(projects||[]).map((p:any)=>{const benefit=n(p.expected_monthly_revenue)+n(p.expected_monthly_savings);const affordability=n(p.estimated_cost)<=cash?10:-10;const confidencePenalty=confidence<0.7?-15:0;return {...p,portfolio_score:n(p.priority_score)+affordability+confidencePenalty+(benefit>0?5:-10)};}).sort((a:any,b:any)=>b.portfolio_score-a.portfolio_score);
    const approvedNeed=ranked.filter((p:any)=>["approved","funded","in_progress"].includes(p.status)).reduce((sum:number,p:any)=>sum+Math.max(n(p.estimated_cost)-n(p.actual_cost),0),0);
    const gap=Math.max(approvedNeed-cash,0); const warnings:string[]=[]; const funding:string[]=[];
    if(confidence<0.7)warnings.push("Reconciliation and cost coverage must improve before major commitments");
    if(gap>0)funding.push(`Close the £${gap.toFixed(2)} approved-plan funding gap before starting all projects`);
    funding.push("Keep Purchase Reserve ring-fenced for actual landed product and direct costs");
    funding.push("Allocate Growth 2% and Marketing 5% only after receipts are reconciled");
    const top=ranked.slice(0,3).map((p:any)=>p.title).join(", ")||"No active projects";
    const analysis={headline:"Fund the strongest plan first",summary:`Current ranking favours ${top}. ${confidence<0.7?'Treat this as a provisional order until finance data quality improves.':'Use this order as the starting point for approval and milestone scheduling.'}`,ordered_project_ids:ranked.map((p:any)=>p.id),funding_actions:funding,next_90_days:ranked.slice(0,3).map((p:any)=>`Validate and schedule: ${p.title}`),warnings,confidence:Math.min(confidence,0.95)};
    await db.from("financial_plan_ai_runs").insert({analysis_type:"portfolio",input_snapshot:{project_ids:ranked.map((p:any)=>p.id),baseline_confidence:confidence},output:analysis,model:"centralhub-planning-engine-v1",created_by:userData.user.id});
    return json({analysis});
  }catch(error){return json({error:error instanceof Error?error.message:"Financial planning analysis failed"},500);}
});
