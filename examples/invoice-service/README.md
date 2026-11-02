# Invoice service

A standalone HTTP example using Python’s standard library and synthetic data.
Start it with `python3 service.py`. It listens on `127.0.0.1:8099`; it is not
connected to crabcode’s CLI or plugins.

`GET /invoices/1001` with `Authorization: Bearer session-amber` reads an Amber
invoice. Violet’s invoice `1002` must remain inaccessible to that session.
Unknown sessions receive HTTP 401. Missing or inaccessible invoices return 404.
