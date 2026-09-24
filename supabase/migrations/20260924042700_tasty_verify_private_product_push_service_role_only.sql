revoke all on function public.tasty_verify_private_product_push(text) from public,anon,authenticated;
grant execute on function public.tasty_verify_private_product_push(text) to service_role;
