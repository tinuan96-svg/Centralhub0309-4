-- Cross-company FK hardening. No existing HR records are deleted or modified.
alter table hr.payroll_runs add constraint hr_payroll_runs_id_company_unique unique(id,company_id);
alter table hr.payroll_items add constraint hr_payroll_items_run_company_fk foreign key(payroll_run_id,company_id) references hr.payroll_runs(id,company_id) on delete restrict;
alter table hr.payroll_items add constraint hr_payroll_items_id_employee_company_unique unique(id,employee_id,company_id);
alter table hr.payslip_versions add constraint hr_payslip_item_employee_company_fk foreign key(payroll_item_id,employee_id,company_id) references hr.payroll_items(id,employee_id,company_id) on delete restrict;