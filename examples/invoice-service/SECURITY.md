# Security policy

An authenticated customer may read only invoices belonging to their own tenant.
Customers can choose arbitrary invoice IDs in requests. A valid bearer session
identifies the caller’s tenant; it does not grant access to other tenants.

The in-memory sessions and invoice records stand in for an identity provider and
a database. All records and session values in this example are synthetic.
