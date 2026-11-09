import assert from "node:assert/strict";
import test from "node:test";
import { exportLine, parseRemotePort } from "../../src/features/ssh-tunnel/tunnelPort.ts";

test("the server port field takes whole ports from 1024 to 65535, or nothing", () => {
  assert.equal(parseRemotePort(" 10089 "), 10089);
  assert.equal(parseRemotePort("1024"), 1024);
  assert.equal(parseRemotePort("65535"), 65535);
  assert.equal(parseRemotePort(""), null);
  assert.equal(parseRemotePort("   "), null);
  for (const bad of ["1023", "65536", "80", "10089.5", "1e4", "-10089", "zcm6", "0x2759"]) {
    assert.equal(parseRemotePort(bad), "invalid", bad);
  }
});

test("the export line points both cases of the proxy variables at the tunnel", () => {
  assert.equal(
    exportLine(10089),
    "export http_proxy=http://127.0.0.1:10089 https_proxy=http://127.0.0.1:10089 HTTPS_PROXY=http://127.0.0.1:10089",
  );
});
