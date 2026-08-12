#!/bin/sh
# Boots tailscaled/tailscale up via the image's normal containerboot process,
# then declares Funnel routes once the node is connected. Using the CLI here
# (rather than a static TS_SERVE_CONFIG file) means we never need to know the
# tailnet's MagicDNS domain up front — `tailscale serve`/`funnel` resolve it
# for "this node" automatically.
set -e

/usr/local/bin/containerboot &
BOOT_PID=$!

until tailscale status --json 2>/dev/null | grep -q '"BackendState": *"Running"'; do
  sleep 1
done

# API on 8443 — a plain HTTPS port Funnel allows. The frontend is hosted
# elsewhere and is not served from this node. --https=8443 alone would only
# be reachable within the tailnet; funnel with the same flag is what makes
# it public. Re-running this on every start is a no-op if already configured.
tailscale funnel --bg --https=8443 http://127.0.0.1:8000

wait "$BOOT_PID"
