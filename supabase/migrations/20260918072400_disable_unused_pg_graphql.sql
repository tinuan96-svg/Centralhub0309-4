-- CentralHub uses Supabase REST/RPC, not pg_graphql.
-- Disable the unused GraphQL extension so database schema metadata is not
-- discoverable through /graphql/v1 by anon or authenticated roles.
drop extension if exists pg_graphql;
