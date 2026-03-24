// This file re-exports from the decomposed map/ module.
// The actual implementation lives in ./map/MapView.tsx with extracted child components.
// This re-export preserves backward compatibility so Home.tsx doesn't need to change its import.

export { MapView } from "./map/MapView";
export type { MapViewRef, InternalTagStyle, CollaborationLine } from "./map/types";
