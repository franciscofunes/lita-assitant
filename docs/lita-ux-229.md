# Lita UX #229 — chat design system and confirmed history deletion

The design authority is the live LTC **Transactions** page, shared with Banks and Portfolio. Lita's Next.js chat is embedded as an iframe and must visually integrate with that system; styling only the LTC overlay is insufficient.

## Implemented in Lita iframe
- Header identity and actions adopt the same white / slate-800 surfaces, violet controls, label hierarchy and minimum **44px hit targets** as the LTC host. The mobile chat header wraps navigation into a second row rather than clipping in a 390px viewport.
- Message bubbles, empty state, chat composer and history records use opaque surfaces in both themes. Nested information is slate-50 / slate-900/70, with established violet accents rather than bespoke brightly-colored chrome.
- Existing `visualViewport` adjustment, scrollable conversation/composer separation, sanitized Streamdown Markdown, link/table contrast and host-controlled `html.dark` remain intact.
- Historical conversations can only be deleted after an accessible confirmation. The thread remains visible until the host replies with a matching `lita:history:delete:result` request ID and success flag. Errors/timeouts keep the thread and show a retry. The dialog uses keyboard Escape, focus targeting and 44px actions.
- When LTC hides financial values, it sends only a redacted `privacy-hidden` context and an empty history, marked temporarily unavailable. The chat shows a clear explanation, without suggesting a failed Firestore read or exposing historical amounts.

## Parent ↔ iframe protocol

~~~mermaid
sequenceDiagram
  participant Person as User
  participant Frame as Lita iframe
  participant LTC as LTC authenticated host
  participant DB as Firestore
  Person->>Frame: Choose Delete on a history row
  Frame->>Person: Confirm conversation and action
  Person->>Frame: Confirm deletion
  Frame->>LTC: lita:history:delete {id,requestId}
  LTC->>DB: deleteLitaChat(uid,id)
  alt write succeeds
    DB-->>LTC: Confirmed
    LTC-->>Frame: lita:history:delete:result {id,requestId,success:true}
    Frame->>Person: Remove thread from visible history
  else write denied / fails
    DB-->>LTC: Failure
    LTC-->>Frame: lita:history:delete:result {id,requestId,success:false,reason}
    Frame->>Person: Keep conversation and offer retry
  end
~~~

LTC verifies the **source window and allowed origin** before performing owner-scoped Firestore operations. Lita verifies trusted parent origins before handling responses. Older iframe builds without request IDs remain supported by LTC; the **new iframe requires the new host** for a safe confirmed deletion. **Release the LTC host PR first**, then release this Next.js PR.

## Safety and testing
- No changes to the AI provider API, Firestore collections, permission rules, financial formulas or transaction imports.
- Deleting a Lita chat must not delete a banking transaction, portfolio position or PDF statement.
- `node --test tests/lita-ux-consistency.test.mjs` enforces key markup, trusted parent messaging, scope and acknowledgment invariants. The Financial Scope GitHub workflow runs it alongside existing domain tests and Next.js production build.
- Additional manual release gate (not certified by source tests): signed-in LTC × deployed iframe at 390/1440/1728px, light/dark, virtual keyboard and long/streaming messages, history retries and real Firestore denial, desktop and mobile.

The owning LTC companion PR and its docs live in `franciscofunes/lleva-tus-cuentas`, [Lita UX #229](https://github.com/franciscofunes/lleva-tus-cuentas/issues/229).
