# UnderPAR Pass Vault Hydration Flow Analysis

**Analysis Date**: April 7, 2026  
**File**: popup.js (102,250 lines)

---

## 1. CURRENT HYDRATION FLOW

### Entry Point
**Function**: `buildPassVaultServiceHydrationEntries()` [Line 9334-9393]

```javascript
buildPassVaultServiceHydrationEntries({
  programmer = null,
  registeredApplications = [],
  existingRecord = null,
} = {})
```

**Flow Overview**:
```
Input: { programmer, registeredApplications[], existingRecord }
    ↓
1. Run scanAllChannelsServiceCoverage(registeredApplications) [Line 9343]
    ↓
2. For EACH definition in UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS [Line 9345]:
   - Get existingService record [Line 9346-9348]
   - Call resolvePassVaultHydrationServiceApplication() [Line 9349-9355]
   - Build entry with: available, status, registeredApplication, client
    ↓
3. Attach scan result to entries.__scanResult [Line 9390-9391]
    ↓
Output: { restV2, esm, degradation, resetTempPass, __scanResult }
```

### Where scanAllChannelsServiceCoverage Is Called
[Line 9343] - **Single call, runs ONCE per hydration**
```javascript
const scanResult = scanAllChannelsServiceCoverage(registeredApplications);
```

This is a **pre-pass** that walks 100% of registered applications before ANY individual service resolution.

---

## 2. ALL CHANNELS SERVICE COVERAGE SCAN

### Function
**scanAllChannelsServiceCoverage()** [Lines 9152-9268]

### Key Logic: 100% App Coverage

```javascript
for (const app of apps) {  // ← Loop through EVERY app with a guid
  const healthRecord = buildRegisteredApplicationHealthAppRecord(app, null);
  const hints = healthRecord?.serviceProviderHints
    .map(h => computeEntityReferenceId(String(h).trim()))
    .filter(h => h && h !== "all channels" && h !== "*")
    : [];
  
  const appIsAllChannels = hints.length === 0;  // ← Empty hints = All Channels
  
  for (const def of UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS) {  // ← Check each service scope
    const scopeMatch = 
      def.serviceKey === "degradation"
        ? degradationAppHasRequiredScope(app)
        : registeredApplicationMatchesNativeRequiredScope(app, def.requiredScope);
    
    if (!scopeMatch) continue;  // ← Early exit PER SCOPE if no match
    
    allScopeApps[def.serviceKey].push(app);  // ← Track ALL matching apps
    // ...categorize as All Channels or channel-specific
  }
}
```

### Data Structures Built
- **`allChannelsWinner[serviceKey]`** - First "All Channels" app per scope (priority winner)
- **`allChannelsFound[serviceKey]`** - Boolean: does this scope have an All Channels app?
- **`channelSpecificApps[serviceKey]`** - Array of `{ app, channel }` for requestor-scoped apps
- **`allScopeApps[serviceKey]`** - ALL apps (All Channels + channel-specific) that match the scope
- **`requestorFilter`** - null (if all scopes have All Channels) OR array of serviceProvider hints (constrained)

### Return Value [Line 9256]
```javascript
{
  winnerByServiceKey,              // { restV2: app, esm: app, ... }
  allChannelsByServiceKey,         // { restV2: true, esm: false, ... }
  channelAppsByServiceKey,         // { restV2: [{app, channel}], ... }
  allScopeAppsByServiceKey,        // { restV2: [app, ...], esm: [...], ... }
  requestorFilter,                 // null OR [requestorId1, requestorId2, ...]
}
```

---

## 3. ALL CHANNELS DETECTION

### Function 1: isAllChannelsApp()
**Location**: [Line 88955]

```javascript
function isAllChannelsApp(appInfo) {
  return getRegisteredAppChannel(appInfo) === "";  // ← Empty string = All Channels
}
```

**Single responsibility**: Boolean check. Returns TRUE if app serves ALL requestors/channels.

### Function 2: getRegisteredAppChannel()
**Location**: [Line 88824-88959]

**Three-Tiered Source Priority**:

#### Tier 1: Entity Data from __rawEnvelope (Most Authoritative)
```
appInfo.__rawEnvelope.entityData {
  serviceProviders: [],
  contentProviders: [],
  requestors: [],
  requestorIds: [],
  requestor: string,
  serviceProvider: string,
  serviceProviderHint: string,
  channel: string
}
```
**Logic**:
- Extract first hint using `sanitizePassVaultHintList(...)` [Line 88868]
- If hint is **NOT** "All Channels" → Return that specific channel (e.g., "CNN")
- If hint **IS** "All Channels" or explicit blank → Return `""` (All Channels)
- If entityData exists but NO hints → Fall through to JWT

#### Tier 2: Software Statement JWT Claims (Fallback)
```javascript
const softwareStatement = firstNonEmptyString([
  appInfo?.softwareStatement,
  appData?.softwareStatement,
  extractSoftwareStatementFromAppData(appData),
  extractSoftwareStatementFromAppData(appInfo),
]);
```
**Logic**:
- Decode JWT and extract `serviceProvider`/`requestors` claims
- Call `collectPassVaultServiceProviderHintsFromAppData(null, softwareStatement)` [Line 88905]
- Same logic as entityData: specific channel OR All Channels

#### Tier 3: appData Top-Level Fields (Last Resort)
```
appData {
  serviceProviders: [],
  contentProviders: [],
  requestors: [],
  requestorIds: [],
  requestor: string,
  serviceProvider: string,
  serviceProviderHint: string,
  channel: string
}
```
**Why Last Resort?**
> "These can be runtime-tainted after /configuration merge, so only check them when entityData and JWT both came up empty." [Line 88921 comment]

#### Return Values
- **Specific Channel** (e.g., "CNN", "TBS") - Channel string
- **All Channels** - `""` (empty string)
- **Ambiguous/No Data** - `null` (app might be scoped, but we can't tell)

---

## 4. SCOPE CLASSIFICATION

### Scope Definitions
**Modern Adobe Pass in 2026 DCR Scopes** [Lines 179-184]:

```javascript
const PREMIUM_SERVICE_SCOPE_BY_KEY = {
  degradation: "decisions:owner",
  esm: "analytics:client",
  restV2: "api:client:v2",
};
const PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE = "temporary:passes:owner";
const DEGRADATION_SCOPE_CANDIDATES = ["decisions:owner"];
```

### Service Definition Registry
**UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS** [Lines 214-218]:

```javascript
const UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS = Object.freeze([
  { serviceKey: "restV2", label: "REST V2", requiredScope: "api:client:v2" },
  { serviceKey: "esm", label: "ESM", requiredScope: "analytics:client" },
  { serviceKey: "degradation", label: "DEGRADATION", requiredScope: "decisions:owner" },
  { serviceKey: "resetTempPass", label: "TempPASS", requiredScope: "temporary:passes:owner" },
]);
```

### How Apps Are Matched to Scopes

#### For restV2, esm, resetTempPass
**Function**: `registeredApplicationMatchesNativeRequiredScope()` [Line 9068-9078]

```javascript
function registeredApplicationMatchesNativeRequiredScope(application = null, requiredScope = "") {
  const normalizedRequiredScope = normalizeScope(requiredScope);
  if (!application || !normalizedRequiredScope) {
    return false;
  }

  return (Array.isArray(application?.scopes) ? application.scopes : [])
    .map((scope) => normalizeScope(scope))
    .filter(Boolean)
    .includes(normalizedRequiredScope);  // ← Exact match check
}
```

**Check**: Does `application.scopes[]` contain the exact normalized scope?

#### For degradation (Special Case)
**Function**: `degradationAppHasRequiredScope()` [Line 66481-66483]

```javascript
function degradationAppHasRequiredScope(appInfo) {
  return Boolean(
    getPreferredDegradationScopeForApp(appInfo) ||
    appHasMappedPremiumServiceKey(appInfo, "degradation")
  );
}
```

**Check**: Either has a preferred degradation scope candidate OR has mapped service key.

### Where Scope Checking Happens in Scan

[Line 9187-9188] **Inside the scan loop**:

```javascript
for (const def of UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS) {
  const scopeMatch =
    def.serviceKey === "degradation"
      ? degradationAppHasRequiredScope(app)
      : registeredApplicationMatchesNativeRequiredScope(app, def.requiredScope);
  
  if (!scopeMatch) {
    continue;  // ← Early continue to next serviceKey
  }
  // Only apps that match this scope are added to allScopeApps[def.serviceKey]
}
```

---

## 5. CURRENT TOKEN PROVISIONING

### Where Access Tokens Are Requested During Hydration

**Entry Point**: `hydratePassVaultServiceRecordWithContext()` [Line 9430-9706]

This function is called **AFTER** the scan phase to actually hydrate individual service records with client credentials.

### Token Request Decision Logic

**Line 9646-9651** - Determines if a token refresh is needed:

```javascript
if (hydrationContext?.forceRefresh === true || 
    serviceClientNeedsPassVaultRefresh(nextClient, requiredScope, normalizedDefinition.serviceKey)) {
  // Request a NEW token
} else if (programmerId && guid) {
  // No refresh needed, just save current state
  saveDcrCache(programmerId, guid, nextClient, normalizedDefinition.serviceKey);
}
```

### serviceClientNeedsPassVaultRefresh() [Line 9395-9428]

Determines if token is needed NOW:

```javascript
function serviceClientNeedsPassVaultRefresh(client = null, requiredScope = "", serviceKey = "") {
  const currentClient = normalizeUnderparVaultDcrCache(client || null);
  
  // Need refresh if:
  if (!currentClient?.clientId || !currentClient?.clientSecret) {
    return true;  // ← MISSING CREDENTIALS
  }
  
  if (!currentClient?.accessToken) {
    return true;  // ← MISSING TOKEN
  }

  const tokenClaims = parseJwtPayload(String(currentClient.accessToken || "")) || {};
  const expiresAtMs = Number(tokenClaims?.exp || 0) > 0
    ? Number(tokenClaims.exp) * 1000
    : Number(currentClient.tokenExpiresAt || 0);
  
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + 60 * 1000) {
    return true;  // ← TOKEN EXPIRED (or expires in <60s)
  }

  // Check scope satisfaction
  const normalizedRequiredScope = normalizeScope(requiredScope);
  if (!normalizedRequiredScope) {
    return false;  // No scope required, token is OK
  }

  const tokenScope = firstNonEmptyString([currentClient.tokenScope, tokenClaims?.scope]);
  const scopeSatisfied = tokenScopeSatisfiesRequiredScope(
    tokenScope,
    String(currentClient.accessToken || ""),
    normalizedRequiredScope,
    {
      strictUnknown: strictScopeValidation,
      requestedScopeHint: String(currentClient.tokenRequestedScope || currentClient.serviceScope || ""),
    }
  );
  
  if (scopeSatisfied) {
    return false;  // ← SCOPE OK, NO REFRESH NEEDED
  }

  return !shouldAllowImplicitEsmTokenScope(...);  // For ESM special case
}
```

### Token Request Function

**Function**: `requestClientCredentialsToken()` [Line 91241+]

```javascript
async function requestClientCredentialsToken(
  clientId,
  clientSecret,
  debugMeta = null,
  requestedScope = "",
  options = {}
) {
  const tokenEndpointUrl = `${ADOBE_SP_BASE}/o/client/token`;
  const strictScopeValidation = options?.strictScopeValidation === true;
  const tokenAttemptMode = options?.tokenAttemptMode === "scoped-only" ? "scoped-only" : "default";
  
  const attempts = ["form", "query"];
  for (const transport of attempts) {
    // POST to /o/client/token with:
    // grant_type: "client_credentials"
    // client_id: clientId
    // client_secret: clientSecret
    // scope: requestedScope
    
    // Returns: { accessToken, tokenExpiresAt, tokenScope, attemptedScope }
  }
}
```

**Called At** [Line 9635-9651]:

```javascript
if (/* token refresh needed */) {
  try {
    const strictScopeValidation = normalizedDefinition.serviceKey === "esm";
    const tokenAttemptMode = strictScopeValidation ? "scoped-only" : "default";
    
    const token = await requestClientCredentialsToken(
      nextClient.clientId,
      nextClient.clientSecret,
      {
        service: normalizedDefinition.serviceKey,
        scope: normalizedDefinition.serviceKey,
        requiredServiceScope: requiredScope,
        appGuid: guid,
        appName: String(registeredApplication?.appName || guid || ""),
      },
      requiredScope,
      { strictScopeValidation, tokenAttemptMode }
    );
    
    nextClient.accessToken = token.accessToken;
    nextClient.tokenExpiresAt = token.tokenExpiresAt;
    nextClient.tokenScope = String(token.tokenScope || "");
    nextClient.tokenRequestedScope = String(token.attemptedScope || requiredScope || "").trim();
  } catch (error) {
    // Return error status
  }
}
```

### NOW vs LATER Token Provisioning

**NOW Tokens** (During hydration):
- Apps with missing `clientId`/`clientSecret`
- Apps with missing `accessToken`
- Apps with expired tokens (< 60s TTL)
- Apps with unsatisfied scope requirements

**LATER Tokens** (Deferred):
- Apps with valid, non-expired tokens that satisfy the required scope
- These are simply cached and reused without requesting new tokens

---

## 6. MISSING PIECE: Why Not 100% Application Processing?

### The Critical Limitation

**The scan DOES loop 100% of applications** [Line 9160]:

```javascript
for (const app of apps) {  // ← This iterates EVERY app
```

However, **the hydration phase only processes the WINNERS**:

### Where the Early Exit Happens

**Function**: `buildPassVaultServiceHydrationEntries()` [Line 9345]:

```javascript
UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS.forEach((definition) => {
  // Only processes 4 service scopes (fixed list)
  const registeredApplication = resolvePassVaultHydrationServiceApplication({
    definition,
    programmerId,
    registeredApplications,
    existingRecord,
    scanResult,
  });
  
  // This call selects ONLY ONE app per scope
  // ↓ 1 app for restV2
  // ↓ 1 app for esm
  // ↓ 1 app for degradation
  // ↓ 1 app for resetTempPass
  // = ONLY 4 APPS HYDRATED MAXIMUM
}
```

### The Bottleneck: resolvePassVaultHydrationServiceApplication()

**Location**: [Line 9270-9327]

```javascript
function resolvePassVaultHydrationServiceApplication({
  definition = null,
  programmerId = "",
  registeredApplications = [],
  existingRecord = null,
  scanResult = null,
} = {}) {
  
  // ── Priority 1: All Channels winner from scan ──────────────
  if (scanResult?.winnerByServiceKey?.[serviceKey] && 
      scanResult.allChannelsByServiceKey?.[serviceKey] === true) {
    return buildPassVaultCompactRegisteredApplication(scanWinner);  // ← ONLY 1 APP
  }
  
  // ── Priority 2: Scan winner (channel-specific) ────────────
  if (scanWinner?.guid && scanResult) {
    return buildPassVaultCompactRegisteredApplication(scanWinner);  // ← ONLY 1 APP
  }
  
  // ── Fallback: Legacy selection logic ─────────────────────
  const matchingApplications = normalizedApplications.filter(app =>
    registeredApplicationMatchesNativeRequiredScope(app, requiredScope)
  );
  
  const selectedApplication =
    existingBoundMatch ||
    selectPreferredPassVaultHydrationServiceApplication(
      definition.serviceKey,
      matchingApplications,
      programmerId
    ) ||
    matchingApplications[0] ||
    null;
  
  return buildPassVaultCompactRegisteredApplication(selectedApplication);  // ← ONLY 1 APP
}
```

### Why This Design?

**By Scope Design** [Line 9345]:
```javascript
// There are EXACTLY 4 service scopes defined:
UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS.forEach((definition) => {
  // restV2 → 1 selected app
  // esm → 1 selected app
  // degradation → 1 selected app
  // resetTempPass → 1 selected app
});
```

The hydration is **scope-based selection**, not **app-based exhaustive processing**.

### Information Captured in Scan (Not Lost)

Though only 1 app per scope gets hydrated, the scan result preserves ALL app info:

```javascript
entries.__scanResult = {
  winnerByServiceKey,          // The 1 app selected per scope
  allChannelsByServiceKey,     // Boolean: does scope have All Channels coverage?
  channelAppsByServiceKey,     // ALL channel-specific apps for each scope
  allScopeAppsByServiceKey,    // ALL apps that match each scope (100% info remains)
  requestorFilter,             // Filtered requestor list for UI
}
```

**Available at [Line 9390-9391]**:

```javascript
// Attach the scan result so downstream consumers 
// (buildPassVaultDirectPremiumServicesSnapshot, getRequestorsForSelectedMediaCompany) 
// can use the requestor filter and allChannels coverage.
entries.__scanResult = scanResult;
```

---

## 7. LOGICAL FLOW SUMMARY

### High-Level Hydration Pipeline

```
INPUT: programmer, registeredApplications[], existingRecord

PHASE 1: SCAN (100% coverage)
├─ scanAllChannelsServiceCoverage(registeredApplications)
│  ├─ For each app:
│  │  ├─ Determine if All Channels or channel-specific
│  │  └─ Match against all 4 service scopes
│  └─ Return: allChannelsWinner, allChannelsFound, channelApps, allScopeApps, requestorFilter

PHASE 2: RESOLUTION (4 service scopes max)
├─ For each UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS[]:
│  ├─ resolvePassVaultHydrationServiceApplication()
│  │  ├─ Priority 1: All Channels winner from scan
│  │  ├─ Priority 2: Other scan winner (channel-specific)
│  │  └─ Priority 3: Legacy selection fallback
│  └─ Select 1 app per scope

PHASE 3: HYDRATION (concurrent or sequential)
├─ hydratePassVaultServiceRecordWithContext() for each scope's app
│  ├─ If needs client credentials: fetch via DCR
│  ├─ If needs token: call requestClientCredentialsToken()
│  └─ Cache the result: saveDcrCache(programmerId, guid, client, serviceKey)

OUTPUT: entries {
  restV2: { available, registeredApplication, client, status },
  esm: { available, registeredApplication, client, status },
  degradation: { available, registeredApplication, client, status },
  resetTempPass: { available, registeredApplication, client, status },
  __scanResult: { winnerByServiceKey, allChannelsFound, ... }
}
```

---

## 8. KEY FUNCTION SOURCE LINES

### Service Definitions & Scopes
- **PREMIUM_SERVICE_SCOPE_BY_KEY**: [Line 179-182]
- **PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE**: [Line 184]
- **UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS**: [Line 214-218]
- **DEGRADATION_SCOPE_CANDIDATES**: [Line 205]

### Hydration Core
- **buildPassVaultServiceHydrationEntries()**: [Line 9334-9393]
- **scanAllChannelsServiceCoverage()**: [Line 9152-9268]
- **resolvePassVaultHydrationServiceApplication()**: [Line 9270-9327]
- **hydratePassVaultServiceRecordWithContext()**: [Line 9430-9706]

### Channel Detection
- **isAllChannelsApp()**: [Line 88955-88956]
- **getRegisteredAppChannel()**: [Line 88824-88959]
- **isAllChannelsServiceProviderValue()**: [Line 87876-87905]

### Scope Matching
- **registeredApplicationMatchesNativeRequiredScope()**: [Line 9068-9078]
- **degradationAppHasRequiredScope()**: [Line 66481-66483]
- **normalizeScope()**: [Line 88099+]

### Token Provisioning
- **serviceClientNeedsPassVaultRefresh()**: [Line 9395-9428]
- **requestClientCredentialsToken()**: [Line 91241+]
- **tokenScopeSatisfiesRequiredScope()**: [Line 91015+]

### Service Provider Hints (All Channels Detection)
- **collectPassVaultServiceProviderHintsFromAppData()**: [Line 6570+]
- **buildRegisteredApplicationHealthAppRecord()**: [Line 24897+]
- **sanitizePassVaultHintList()**: [Referenced in getRegisteredAppChannel]

---

## 9. MODIFICATIONS NEEDED FOR FULL COLLECTION PROCESSING

To process 100% of registered applications (not just 1 per scope):

### Option A: Exhaustive Service-By-Service Collection
Modify `buildPassVaultServiceHydrationEntries()` to:
```javascript
// Instead of:
UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS.forEach((definition) => {
  // Select 1 app per scope
});

// Do:
UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS.forEach((definition) => {
  const allMatchingApps = registeredApplications.filter(app =>
    registeredApplicationMatchesNativeRequiredScope(app, definition.requiredScope)
  );
  
  for (const app of allMatchingApps) {
    // Hydrate EVERY matching app, not just the winner
    entries[`${definition.serviceKey}:${app.guid}`] = 
      await hydratePassVaultServiceRecordWithContext(
        { registeredApplication: app },
        definition,
        hydrationContext
      );
  }
});
```

**Functions to Modify**:
- `buildPassVaultServiceHydrationEntries()` [Line 9334]
- `resolvePassVaultHydrationServiceApplication()` [Line 9270] - Remove single-app selection

### Option B: Preserve Winners, Add All-Apps Dataset
Keep current winner selection, but add a parallel collection:
```javascript
entries.__allAppsHydration = {
  restV2: await hydrateAllAppsByScope("restV2"),
  esm: await hydrateAllAppsByScope("esm"),
  degradation: await hydrateAllAppsByScope("degradation"),
  resetTempPass: await hydrateAllAppsByScope("resetTempPass"),
};
```

**New Function Needed**:
```javascript
async function hydrateAllAppsByScope(serviceKey, registeredApplications, hydrationContext) {
  const definition = UNDERPAR_VAULT_DCR_SERVICE_DEFINITIONS.find(
    d => d.serviceKey === serviceKey
  );
  
  const matchingApps = registeredApplications.filter(app =>
    serviceKey === "degradation"
      ? degradationAppHasRequiredScope(app)
      : registeredApplicationMatchesNativeRequiredScope(app, definition.requiredScope)
  );
  
  const hydratedApps = {};
  for (const app of matchingApps) {
    hydratedApps[app.guid] = await hydratePassVaultServiceRecordWithContext(...);
  }
  return hydratedApps;
}
```

**Functions to Create**:
- `hydrateAllAppsByScope()` - New helper
- `hydratePassVaultServiceRecordWithContext()` [Line 9430] - Already exists, just loop over it

