---
title: HTTP Status Codes
tags: [http, web, reference, example]
---

# HTTP Status Codes

HTTP status codes are three-digit numbers a server returns to describe the outcome
of a request. The first digit defines the class of response.

- **1xx Informational** — request received, continuing.
- **2xx Success** — the request succeeded. `200 OK`, `201 Created`, `204 No Content`.
- **3xx Redirection** — further action needed. `301 Moved Permanently`, `302 Found`, `304 Not Modified`.
- **4xx Client Error** — the request is malformed or unauthorized. `400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `429 Too Many Requests`.
- **5xx Server Error** — the server failed to fulfill a valid request. `500 Internal Server Error`, `502 Bad Gateway`, `503 Service Unavailable`.

A `301` signals a permanent move and lets clients update bookmarks, while a `302`
is temporary. A `304 Not Modified` tells the client its cached copy is still valid,
saving bandwidth. The difference between `401` and `403` matters: `401` means "not
authenticated" (you need to log in), whereas `403` means "authenticated but not
allowed" (you are logged in but lack permission).
