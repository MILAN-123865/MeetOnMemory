# Production CSRF Regression Investigation

## Overview
This report investigates the root cause of the consistent 403 Forbidden CSRF validation failures in the production deployment for authenticated users attempting to create or join organizations. The investigation confirms that authentication functions correctly, but the CSRF validation fails because the browser does not send the `_csrf` cookie on cross-origin POST requests.

## Deployment Architecture
* **Frontend**: `https://meetonmemory.vercel.app`
* **Backend**: `https://meetonmemory.onrender.com`

These run on completely different origins. Therefore, cookies used for authentication and CSRF protection must be configured to support cross-origin requests (`SameSite=None` with `Secure=true`). 

## Current Cookie Configuration
In `server/middleware/csrfProtection.js`, the current CSRF cookie configuration is:

| Setting | Current Value |
|---------|---------------|
| name | `_csrf` |
| secure | `process.env.NODE_ENV === "production"` |
| httpOnly | `true` |
| sameSite | `process.env.NODE_ENV === "production" ? "none" : "strict"` |

## Request Flow
1. **Authentication (Login/Session Start)**: The user authenticates successfully (e.g., via `POST /api/auth/login`). The backend successfully generates and sends the JWT `token` cookie and the `_csrf` cookie.
2. **Cross-Origin POST**: The authenticated user triggers an action like `POST /api/organizations/create-or-join`.
3. **Frontend Request**: The frontend browser includes the `token` cookie (because it's correctly configured as `SameSite=None` dynamically at request time) and sends the `X-CSRF-Token` header.
4. **Browser Omission**: Because the `_csrf` cookie was generated with `SameSite=Strict`, the browser strictly prevents it from being sent on the cross-origin POST request.
5. **CSRF Validation Failure**: The `csurf` middleware on the backend checks `req.cookies._csrf`. Finding it missing, it rejects the `X-CSRF-Token` header, returning a `403 Forbidden`.
6. **Token Regeneration**: Since the backend didn't see the `_csrf` cookie, `csurf` assumes the user needs a new one and generates a new secret, appending `Set-Cookie: _csrf=...` to the 403 response.

## Browser Observations
Browser DevTools confirms the issue:
* `_csrf` is present in browser storage.
* It is marked as `HttpOnly: true` and `Secure: true`.
* Crucially, **`SameSite` is `Strict`**.

Because `SameSite=Strict` is evaluated by the browser against the cross-origin domains (Vercel vs. Render), the browser rightfully refuses to attach the `_csrf` cookie on POST requests.

## Git History Review
An analysis of `server/middleware/csrfProtection.js` and `server/server.js` reveals the following key commits:

1. **`9dd6e3e240973c40a0a29bc547b9516a8c7ccb33`** (Thu Jul 16): Refactored `server.js` and moved CSRF configuration out into `server/middleware/csrfProtection.js`.
2. **`cf42c48e26129475c1b866e9f1f7067a640be428`** (Mon Jul 20): Attempted to fix the split-origin deployment by updating the CSRF middleware cookie to use `sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"`.
3. **`ba63f851e1ed97b74026a65acf0d82a8d7848831`** (Wed Jul 22): Refactored the CSRF middleware implementation to satisfy CodeQL by making CSRF protection global.

## Regression Analysis
The regression originates fundamentally from the refactor in **`9dd6e3e240973c40a0a29bc547b9516a8c7ccb33`** combined with the logic intended to fix it in **`cf42c48e26129475c1b866e9f1f7067a640be428`**.

When the CSRF configuration was moved to a separate file (`csrfProtection.js`), it became an ES module that is imported at the very top of `server/config/express.js`, which in turn is imported at the top of `server/server.js`.

```javascript
import { configureExpress } from "./config/express.js"; // Imports csrfProtection.js
// ...
dotenv.config(); // Loads environment variables
```
Because ES module imports are hoisted and evaluated first, `server/middleware/csrfProtection.js` executes **before** `dotenv.config()` loads `.env` variables into `process.env`. If the production environment relies on `.env` (or similar asynchronous config loading) to set `NODE_ENV=production`, `process.env.NODE_ENV` evaluates to `undefined` during `csurf` initialization. 

This causes the ternary operator (`process.env.NODE_ENV === "production" ? "none" : "strict"`) to evaluate to `"strict"`, hardcoding the CSRF middleware to `SameSite=Strict` for the lifetime of the application instance.

(Note: The authentication controllers evaluate `process.env.NODE_ENV` at *request time*, long after `dotenv` has run, which is why the JWT `token` cookie is correctly set to `SameSite=None`!)

## Root Cause
The root cause is a **module initialization order conflict**. The `csrfProtection` object is instantiated synchronously at module load time before environment variables are fully loaded by `dotenv`, resulting in `SameSite` defaulting to `Strict`. This breaks cross-origin POST requests in the split-origin production architecture because the browser strips the `Strict` cookie.

## Supporting Evidence
* **Code Execution Order**: `csrfProtection.js` is evaluated at the top of the import tree. `dotenv.config()` happens lower in `server.js`.
* **Consistent 403s**: `csurf` requires both the header token and the session cookie to match. The missing `_csrf` cookie guarantees a failure.
* **Browser Storage**: The browser reports `SameSite: Strict` for `_csrf`, but `SameSite: None` for `token`, definitively proving they evaluated `process.env.NODE_ENV` at different times.

## Recommended Production Configuration
To resolve this issue without changing the underlying libraries, the CSRF middleware must evaluate the environment variable dynamically (per-request), or the environment variables must be guaranteed to load before the middleware is imported.

The recommended configuration approach is to wrap the `csrf` instantiation inside a middleware function that generates the configuration dynamically, or defer it:

```javascript
// Recommended approach: Initialize middleware dynamically or ensure environment is loaded first
export const csrfProtectionMiddleware = (req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  
  const protection = csrf({
    cookie: {
      key: "_csrf",
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "strict",
    },
  });

  return protection(req, res, next);
};
```
Alternatively, importing `dotenv/config` at the absolute top of `server.js` (before other local imports) would ensure variables are populated before `csrfProtection.js` evaluates.

## Out of Scope
No code changes have been implemented. Modifying the cookie attributes, refactoring the CSRF middleware, modifying the frontend, or altering the deployment configuration remains out of scope for this investigation issue.
