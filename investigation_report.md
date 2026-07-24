# Investigation Report: Production CSRF Regression (Issue #382)

## Problem Summary
Authenticated users cannot create or join organizations in the production environment (Frontend: Vercel, Backend: Render). The requests to `POST /api/organizations/create-or-join` fail with a `403 Forbidden` status code due to a missing `_csrf` cookie in the cross-origin request headers, despite the browser successfully storing the cookie initially.

## Current Configuration
The current CSRF middleware configuration is located in `server/middleware/csrfProtection.js`:
```javascript
const csrfProtection = csrf({
  cookie: {
    key: "_csrf",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  },
});
```

## Git History Analysis
The regression was introduced and subsequently worsened across two key commits:

1. **Commit `cf42c48e26129475c1b866e9f1f7067a640be428`** (Author: Patel Jivan):
   Attempted to resolve the split-origin issue by changing `sameSite: "strict"` to `sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"`. While the intent was correct, the implementation suffered from an environment variable evaluation bug (see Root Cause).

2. **Commit `ba63f851e1ed97b74026a65acf0d82a8d7848831`** (Author: Himanshu Raj):
   Removed the `csrfMiddleware` wrapper that previously excluded `/api/auth` routes from CSRF protection. Now, CSRF protection applies globally. The frontend requests the CSRF token via `GET /api/csrf-token` (or it's attached on other requests) and receives the flawed cookie. When the frontend subsequently makes cross-origin `POST` requests, the browser refuses to send the CSRF cookie, resulting in a `403 Forbidden`. 

## Root Cause
The root cause is a **timing issue with environment variable loading**. 

In `server/server.js`, the Express configurations are imported at the top of the file:
```javascript
import { configureExpress, configureErrorHandling } from "./config/express.js";
// ...
// Load .env.local if it exists, otherwise fallback to .env
const envPath = path.resolve(__dirname, ".env.local");
dotenv.config({ path: envPath });
dotenv.config(); // Environment variables loaded later
```
Because ES modules evaluate imports before the rest of the file runs, `server/middleware/csrfProtection.js` is evaluated *before* `dotenv.config()` is executed. At the moment `csrfProtection` is instantiated, `process.env.NODE_ENV` is `undefined` (assuming it relies on `.env` on the Render deployment or the `.env` fallback). 

As a result, the ternary operators evaluate to the fallback values:
- `secure: false` 
- `sameSite: "strict"`

Because the cookie is set with `SameSite=Strict`, the browser strictly isolates the cookie to the backend origin (`meetonmemory.onrender.com`). When the frontend (`meetonmemory.vercel.app`) attempts a cross-origin `POST` request, the browser intentionally drops the `_csrf` cookie to prevent Cross-Site Request Forgery. `csurf` then rejects the request because `req.cookies._csrf` is missing. 

*(Note: The JWT `token` cookie works correctly because its configuration resides in `authControllers.js` and is evaluated at runtime during the route execution, at which point `dotenv.config()` has already populated `process.env.NODE_ENV`.)*

## Production Compatibility
The intended logic (`sameSite: "none"` and `secure: true`) is **completely compatible** with a split-origin deployment. The Vercel frontend and Render backend can successfully exchange cross-origin credentials as long as these two attributes are correctly applied to the CSRF cookie.

## Recommended Production Configuration
To fix the issue without altering the CSRF logic, ensure that environment variables are loaded *before* the CSRF middleware evaluates them. 

**Recommendation:**
Refactor the CSRF middleware so that it evaluates `process.env.NODE_ENV` dynamically per request (by passing a wrapper function), OR ensure `dotenv/config` is imported at the absolute top of `server.js` before any other local imports.

Example (Dynamic Wrapper):
```javascript
export const csrfProtectionMiddleware = (req, res, next) => {
  const csrfProtection = csrf({
    cookie: {
      key: "_csrf",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    },
  });
  return csrfProtection(req, res, next);
};
```
Alternatively, simply initialize `dotenv` at the top of `server.js`:
```javascript
import dotenv from 'dotenv';
dotenv.config(); // Or import 'dotenv/config' at the very top
import express from 'express';
// ... remaining imports
```
