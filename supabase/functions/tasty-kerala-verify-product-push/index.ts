import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

// Narrow server-to-server transport-token verifier.
// No product data, Vault secret or Supabase service key is returned to callers.
Deno.serve(async (req: Request) => {
  const reply=(authenticated:boolean,status:number)=>new Response(JSON.stringify({authenticated}),{
    status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  if(req.method!=="POST")return reply(false,405);
  const token=(req.headers.get("x-tasty-sync-secret")||"").trim();
  if(!/^[0-9a-f]{64}$/.test(token))return reply(false,401);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(false,503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const result=await db.rpc("tasty_verify_private_product_push",{p_token:token});
  if(result.error)return reply(false,503);
  return reply(result.data===true,result.data===true?200:401);
});