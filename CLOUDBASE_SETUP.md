# CloudBase Route A Setup

## 1) Required environment variables

Set these in local `.env.local` and your deployment platform:

- `TCB_ENV_ID` (example: `firebill-9g7lg1rzc5ef133e`)
- `TCB_SECRET_ID`
- `TCB_SECRET_KEY`
- `DEEPSEEK_API_KEY` (already used by `/api/review`)

## 2) CloudBase database

- Create collection: `entries`
- Collection permission: `PRIVATE` (read/write own data)

Document fields used by the app:

- `userId: string`
- `description: string`
- `note: string`
- `amount: number`
- `category: "生存刚需" | "情绪补偿" | "社交认同" | "自我成长" | "克制与战利品"`
- `createdAt: string` (ISO date)
- `motiveTag: string`
- `attributeTag: string`
- `realityTag: string`

## 3) New API routes

- `GET /api/entries` (header: `x-user-id`)
- `POST /api/entries` (header: `x-user-id`)
- `PATCH /api/entries/[id]` (header: `x-user-id`)
- `DELETE /api/entries/[id]` (header: `x-user-id`)

## 4) How user isolation works now

The web app creates a local client user id (`fire-assistant-user-id-v1`) and sends it as `x-user-id`.
Server stores and queries records by this `userId`.

> Note: this is a practical Route A solution for web internal testing.  
> For stronger security in production, replace with CloudBase auth / official identity token validation.

