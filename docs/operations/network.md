# The caller's IP address and proxies: runbook

The Rust service (`agents-server`) reads the caller's IP address in one place,
`rust/crates/agents-server/src/http/client_ip.rs` (the rule itself is `agents_core::net::client_ip`).
The sign-in throttle, the audit log (`AuditLog.ipAddress`) and the agent API key IP allowlists all
use it.

## The rule

- The service is served with the socket's peer address (axum `ConnectInfo`). That address is the
  only one a client cannot forge.
- **With `TRUSTED_PROXIES` empty (the default)**, the peer is the caller. `X-Forwarded-For` and
  `X-Real-IP` are ignored entirely: any client can write them.
- **When the peer is in `TRUSTED_PROXIES`**, `X-Forwarded-For` is read from the right, the end each
  proxy appends to, skipping every hop that is itself a trusted proxy. The first hop that is not
  trusted is the caller. A hop that is not an address stops the walk at the last trusted proxy.
  Without `X-Forwarded-For`, a trusted proxy's `X-Real-IP` is used.
- A peer that is not a trusted proxy is the caller, whatever headers it sends.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `TRUSTED_PROXIES` | empty | Comma-separated addresses or CIDR ranges of the proxies in front of the service, for example `10.0.0.0/8,fd00::/8`. A value that does not parse stops the service at start with a message that names the variable |
| `SSO_ALLOW_PRIVATE_NETWORKS` | `false` | Whether an organisation's identity provider may be on a private address. See `docs/operations/sso.md` |

## What to set

- **Behind a load balancer or ingress (the cloud):** set `TRUSTED_PROXIES` to the ranges the
  load balancer and the Next.js server connect from, and nothing wider. Every proxy on the path
  must append to `X-Forwarded-For` (nginx `$proxy_add_x_forwarded_for`, most cloud load balancers
  by default).
- **Next.js in front of the Rust service (the strangler):** include the address Next.js connects
  from, and make sure Next.js forwards the `X-Forwarded-For` it received with its own hop appended.
- **Exposed directly:** leave it empty.

Too wide a range (`0.0.0.0/0`) lets any client choose its address again: the throttle and the
allowlists stop working. Too narrow a range makes every request look like it comes from the proxy:
all users share one throttle bucket (30 failed sign-ins per 15 minutes) and the audit log records
the proxy.
