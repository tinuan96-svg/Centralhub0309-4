/* Stage 10 — Pricing approval and controlled execution.
   Keeps recommendation -> approval -> execution separate. Locked prices cannot be executed.
   No automatic live price changes are introduced by this migration. */

ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending';
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS rejected_by text;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'not_executed';
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS execution_attempted_at timestamptz;
ALTER TABLE pricing_suggestions ADD COLUMN IF NOT EXISTS execution_error text;

CREATE TABLE IF NOT EXISTS pricing_approval_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), run_type text NOT NULL DEFAULT 'manual',
 requested_count integer NOT NULL DEFAULT 0, approved_count integer NOT NULL DEFAULT 0,
 rejected_count integer NOT NULL DEFAULT 0, applied_count integer NOT NULL DEFAULT 0,
 failed_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, created_by text
);
CREATE INDEX IF NOT EXISTS idx_pricing_approval_runs_created ON pricing_approval_runs(created_at DESC);
ALTER TABLE pricing_approval_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_approval_runs_admin ON pricing_approval_runs;
CREATE POLICY pricing_approval_runs_admin ON pricing_approval_runs FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION approve_pricing_recommendation(p_product_id uuid,p_approved_by text DEFAULT 'admin') RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record;
BEGIN
 SELECT * INTO s FROM pricing_suggestions WHERE product_id=p_product_id ORDER BY generated_at DESC NULLS LAST LIMIT 1;
 IF NOT FOUND THEN RETURN json_build_object('success',false,'error','No pricing recommendation found'); END IF;
 IF COALESCE(s.price_locked,false) THEN RETURN json_build_object('success',false,'error','Product price is locked'); END IF;
 UPDATE pricing_suggestions SET approval_status='approved',approved_at=now(),approved_by=p_approved_by,rejected_at=NULL,rejected_by=NULL,rejection_reason=NULL,execution_status='not_executed',execution_error=NULL WHERE id=s.id;
 RETURN json_build_object('success',true,'suggestion_id',s.id,'product_id',p_product_id,'recommended_price',s.recommended_price,'approval_status','approved');
END $$;

CREATE OR REPLACE FUNCTION reject_pricing_recommendation(p_product_id uuid,p_reason text,p_rejected_by text DEFAULT 'admin') RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 SELECT id INTO sid FROM pricing_suggestions WHERE product_id=p_product_id ORDER BY generated_at DESC NULLS LAST LIMIT 1;
 IF sid IS NULL THEN RETURN json_build_object('success',false,'error','No pricing recommendation found'); END IF;
 UPDATE pricing_suggestions SET approval_status='rejected',rejected_at=now(),rejected_by=p_rejected_by,rejection_reason=COALESCE(NULLIF(trim(p_reason),''),'Rejected by administrator'),execution_status='not_executed' WHERE id=sid;
 RETURN json_build_object('success',true,'suggestion_id',sid,'product_id',p_product_id,'approval_status','rejected');
END $$;

CREATE OR REPLACE FUNCTION execute_approved_pricing_recommendation(p_product_id uuid,p_executed_by text DEFAULT 'pricing-control-centre') RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; result json;
BEGIN
 SELECT * INTO s FROM pricing_suggestions WHERE product_id=p_product_id ORDER BY generated_at DESC NULLS LAST LIMIT 1;
 IF NOT FOUND THEN RETURN json_build_object('success',false,'error','No pricing recommendation found'); END IF;
 IF s.approval_status <> 'approved' THEN RETURN json_build_object('success',false,'error','Recommendation must be approved before execution'); END IF;
 IF COALESCE(s.price_locked,false) THEN RETURN json_build_object('success',false,'error','Product price is locked'); END IF;
 UPDATE pricing_suggestions SET execution_status='executing',execution_attempted_at=now(),execution_error=NULL WHERE id=s.id;
 BEGIN
   SELECT public.apply_pricing_recommendation(p_product_id,s.recommended_price,true,p_executed_by,COALESCE(s.decision_reason,s.reason,'Approved pricing recommendation')) INTO result;
   IF COALESCE((result->>'success')::boolean,false) THEN
     UPDATE pricing_suggestions SET execution_status='executed',approval_status='executed',applied_at=now(),applied_by=p_executed_by WHERE id=s.id;
     RETURN result || json_build_object('approval_status','executed');
   ELSE
     UPDATE pricing_suggestions SET execution_status='failed',execution_error=COALESCE(result->>'error','Price application failed') WHERE id=s.id;
     RETURN result || json_build_object('approval_status','approved');
   END IF;
 EXCEPTION WHEN OTHERS THEN
   UPDATE pricing_suggestions SET execution_status='failed',execution_error=SQLERRM WHERE id=s.id;
   RETURN json_build_object('success',false,'error',SQLERRM,'approval_status','approved');
 END;
END $$;

CREATE OR REPLACE FUNCTION get_pricing_approval_queue(p_limit integer DEFAULT 200)
RETURNS TABLE(product_id uuid,product_name text,current_price numeric,recommended_price numeric,expected_daily_profit numeric,expected_profit_per_unit numeric,expected_margin numeric,pricing_status text,approval_status text,execution_status text,price_locked boolean,decision_reason text,generated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
SELECT s.product_id,p.name,s.current_price,s.recommended_price,s.expected_daily_profit,s.expected_profit_per_unit,s.expected_margin,s.pricing_status,s.approval_status,s.execution_status,COALESCE(s.price_locked,false),COALESCE(s.decision_reason,s.reason),s.generated_at
FROM pricing_suggestions s JOIN products p ON p.id=s.product_id
WHERE COALESCE(p.is_deleted,false)=false
ORDER BY CASE s.approval_status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,s.expected_daily_profit DESC NULLS LAST,s.generated_at DESC LIMIT GREATEST(p_limit,1);
$$;

GRANT EXECUTE ON FUNCTION approve_pricing_recommendation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_pricing_recommendation(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION execute_approved_pricing_recommendation(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pricing_approval_queue(integer) TO authenticated;
NOTIFY pgrst,'reload schema';
