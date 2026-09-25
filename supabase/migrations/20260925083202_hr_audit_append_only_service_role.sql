-- HR audit records may be appended and read by the privileged application role, never modified or truncated by it.
revoke update, delete, truncate on hr.change_audit from service_role;
