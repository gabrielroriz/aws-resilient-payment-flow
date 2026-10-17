# Values npm run dev gives the local functions in place of the deployed ones.
# The secrets only protect the local API, so they are committed.
# The simulated gateways' values must match the delivery simulator's defaults.
GATEWAY_GLOBAL_SIGNING_SECRET = "local-gateway-global-secret"
GATEWAY_BRAZIL_ACCESS_TOKEN   = "local-gateway-brazil-token"

# Local runs never pass for a deployed commit.
CODE_VERSION = "local"
