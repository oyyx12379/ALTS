# Permission Model

## User

`User` is the login identity.

Important fields:

- `id`: stable user id.
- `username`: display name.
- `role`: global account role. Room control does not rely on this alone.

## Room Member

`RoomMember` is a user's identity inside one room.

Important fields:

- `roomId`: current room.
- `userId`: linked user.
- `role`: room role, usually `SN` or `PL`.
- `characterId`: optional bound character. A player may join without a character.

Room SN is resolved by:

- `Room.snId === user.id`, or
- `RoomMember.role === "SN"`.

## Token

Client type: `BoardToken`.

Important fields:

- `id`: token id.
- `ownerUserId`: attribution/display owner only.
- `ownerName`: attribution/display owner name.
- `characterId`: optional linked character.
- `allowedUserIds`: users currently allowed by SN to operate this token.
- `locked`: blocks movement even when a player is allowed.
- `x`, `y`, `direction`: player-operable state when permission is granted.
- `size`, `layer`, `image`, `spine`, `disposition`, `threatLevel`, `allowedUserIds`: SN-managed state.

Rules:

- SN can create, edit, move, delete, lock, and grant/revoke every token.
- PL can only move and turn an existing token when their `userId` is in `allowedUserIds` and the token is not locked.
- `ownerUserId` does not grant operation permission by itself.
- Revoking a user's id from `allowedUserIds` immediately removes their operation permission.

## Map / Board Assets

Client type: `BoardImageAsset`.

Important fields:

- `id`: asset id.
- `ownerUserId`: attribution/display owner only.
- `locked`: blocks movement.
- `x`, `y`, `width`, `height`, `layer`, `opacity`: SN-managed map state.

Rules:

- Only SN can import, move, resize, reorder, lock, or delete map images.
- PL map/image changes are ignored by the server.

## Grid

Client type: `BoardGrid`.

Rules:

- Only SN can change grid size, line width, color, visibility, line style, and snap-to-grid.

## Server Enforcement

`room:board:update` is authoritative on the server.

- SN updates are accepted after sanitization.
- PL updates are merged against the previous server board state.
- For PL users, only `x`, `y`, `direction`, and Spine horizontal `facing` are accepted, and only for tokens they are allowed to operate.
- PL attempts to add, delete, or edit tokens/assets/grid are discarded.
- The sanitized board state is broadcast back to all room clients, including the sender, so unauthorized optimistic local changes are corrected.

Transient drag events follow the same token operation permission checks.
