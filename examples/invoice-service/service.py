"""WSGI invoice endpoint backed by a small in-memory ledger."""

import json


# Synthetic sessions stand in for the identity provider.
SESSION_TENANTS = {"session-amber": "amber", "session-violet": "violet"}
INVOICES = {
    "1001": {"tenant": "amber", "total": 125},
    "1002": {"tenant": "violet", "total": 450},
}


def response(start_response, status, payload):
    start_response(status, [("Content-Type", "application/json")])
    return [json.dumps(payload).encode("utf-8")]


def application(environ, start_response):
    if environ["REQUEST_METHOD"] != "GET":
        return response(start_response, "405 Method Not Allowed", {})
    scheme, _, token = environ.get("HTTP_AUTHORIZATION", "").partition(" ")
    tenant = SESSION_TENANTS.get(token) if scheme == "Bearer" else None
    if tenant is None:
        return response(start_response, "401 Unauthorized", {})
    prefix = "/invoices/"
    path = environ.get("PATH_INFO", "")
    invoice = INVOICES.get(path.removeprefix(prefix)) if path.startswith(prefix) else None
    if invoice is None:
        return response(start_response, "404 Not Found", {})
    return response(start_response, "200 OK", invoice)


if __name__ == "__main__":
    from wsgiref.simple_server import make_server

    with make_server("127.0.0.1", 8099, application) as server:
        server.serve_forever()
