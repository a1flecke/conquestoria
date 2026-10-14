# Web smoke service-worker crash (#1486)

The smoke suite blocks service workers by default. Its tests assert live app,
network and renderer behavior; none asserts PWA caching. A PWA/offline test must
explicitly opt in with `test.use({ serviceWorkers: 'allow' })` and own the worker
lifecycle. Standalone performance diagnostics create their own browser contexts
and retain their existing PWA behavior.

## Native failure

The original failures are [main run 38500204147](https://github.com/a1flecke/conquestoria/actions/runs/38500204147)
and [PR run 38502652126](https://github.com/a1flecke/conquestoria/actions/runs/38502652126).
The raw logs contain native stacks. Main actually reports the dark-ocean art
test; the PR reports desert. Both fail at `browser.newContext`, after the previous
test's six canvas readbacks. This is not an art assertion failure.

Both use Playwright 1.61.0 and Chrome Headless Shell 149.0.7827.55, revision 1228.
The launch already includes `--disable-dev-shm-usage`. The exact Linux executable
was downloaded from the same [Playwright CDN archive](https://cdn.playwright.dev/builds/cft/149.0.7827.55/linux64/chrome-headless-shell-linux64.zip).
Its GNU build ID is `c97a9c1daed9622d2d0f626ce0e85170e6e105f2`.

The stripped binary has no function symbols for these frames. Disassembly with
`llvm-objdump`, embedded debug-tag strings and the matching Chromium source
identify the path without pretending the stack was symbolized:

| Executable location | Evidence |
| --- | --- |
| reported return frame `0x653e673` | The enclosing function references `NetworkHandler::LoadNetworkResource`; its non-frame branch calls the agent host's factory method. |
| reported return frame `0x6574d16` | The enclosing function references `SWDTAH::CreateNetworkFactoryParamsForDevTools`. At `0x6574cfa` it calls the live-version lookup, then adds `0xa8` to its result and passes that address to the storage-key isolation-info routine. There is no null check. |
| fault instruction `0x2af9eed` | `cmpl $0x0, 0x108(%rsi)`. The recorded `rax=0` and `si=0xa8` produce precisely `0xa8 + 0x108 = 0x1b0`, the fault address in both runs. |

The matching [Chromium factory source](https://github.com/chromium/chromium/blob/149.0.7827.55/content/browser/devtools/service_worker_devtools_agent_host.cc#L426-L449)
looks up the live service-worker version and uses its storage key unconditionally.
The [network handler](https://github.com/chromium/chromium/blob/149.0.7827.55/content/browser/devtools/protocol/network_handler.cc#L4362-L4468)
reaches that factory for non-frame resources. The native fault is therefore a
missing live service-worker version, not PNG decoding or canvas allocation.

The inferred trigger is trace response-body collection racing context teardown.
In [Playwright's response-body implementation](https://github.com/microsoft/playwright/blob/v1.61.0/packages/playwright-core/src/server/chromium/crNetworkManager.ts),
an empty CDP response with a nonzero content length falls back to
`Network.loadNetworkResource`, including on service-worker sessions. Retained
traces collect network bodies. The app registers its PWA worker during startup;
even these small renderer tests navigate to the full app. Closing their context
can remove the live version before that fallback executes. The precise request
and event ordering were not captured in the original logs.

## Repository fix and related defects

- Block workers in the shared smoke configuration, eliminating this path for
  every ordinary smoke spec and keeping route-based failure injection effective.
- Use `context.newPage()` for the wonder test's comparison page. The former
  `browser.newPage()` created a separate context with default options, bypassing
  the smoke fixture's worker policy, base URL and reduced motion.
- Assert that the comparison really has no loaded art. Hash equality alone could
  pass even if request blocking failed, because construction never draws art.
- Keep tracing, all six PNG decodes, real `drawImage`, three backgrounds, pixel
  and transparency checks, construction hashes, fallback and recovery assertions.

The nearby geo-map and streamed-music specs already block workers explicitly.
No other default smoke spec creates a context manually. The opt-in performance
helpers do so deliberately and include offline/PWA measurements.

[Playwright #43009](https://github.com/microsoft/playwright/issues/43009) documents
a separate service-worker session leak during context close, fixed in #43017.
It is related lifecycle evidence, **not** a report of this native null
dereference, and is not claimed as the cause. An exact upstream crash report
still needs to be filed; changing canvas options, retries or browser lifetime
would not address the native failure identified here.

## Validation boundary

The registration regression first failed on the original configuration with a
real `/conquestoria/` worker registration, then passed with worker blocking.
Run the complete smoke suite and the focused repetition command:

```sh
./scripts/dev.sh web-smoke
./scripts/run-with-mise.sh yarn playwright test tests/e2e/issue-613-wonder-art.spec.ts --repeat-each=30 --workers=1
```

Local macOS results do not establish the issue's Linux acceptance criterion.
Repeat the latter command on Linux with the lockfile-pinned browser before
claiming #1486 fully validated. No Linux runtime is installed on the investigation
host. The native analysis establishes the failing path; it does not substitute
for repeated Linux execution of the workaround.

A manual dispatch of the CI/CD workflow runs the complete smoke suite followed
by 30 wonder-art repetitions on `ubuntu-latest`, with one worker and no retries.
Ordinary PR and main runs retain their existing smoke invocation.
