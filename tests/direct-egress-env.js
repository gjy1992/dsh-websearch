/**
 * Pin a direct-egress environment for tests that stub `globalThis.fetch`.
 *
 * Backends reach the network through lib/util/egress-fetch.js, which tunnels
 * through HTTP_PROXY / HTTPS_PROXY (or the TLS forwarder) whenever those env
 * vars are set. A stub installed on `globalThis.fetch` is bypassed in that
 * case — on a developer machine with a proxy exported, these tests would hit
 * the real network instead of the canned response. Importing this module makes
 * egressFetch defer to the (stubbed) native fetch for the whole test process.
 */
for (const key of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "DSH_EGRESS_FORWARDER"]) {
  delete process.env[key];
}
