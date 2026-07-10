<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## TypeScript
Run `npx tsc --noEmit` from the frontend directory to type-check.

## Debugging checklist (goals not showing on dashboard)
1. Rebuild + redeploy frontend after pulling code
2. Open browser console → look for `[goalStore]` and `[GoalSection]` log messages
3. Check Network tab → `GET /api/v1/goals?organization_id=...&limit=20` response status and body
4. Clear localStorage (key `yesboss-goals`) or test in incognito
5. Restart backend to pick up latest changes
