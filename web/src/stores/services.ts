import { ApiClient } from "@/lib/api/client";
import { RealtimeClient } from "@/lib/api/realtime";

import { useRegion } from "./region";

/** The one API client and socket for the whole app (Flutter's AppServices). */
export const api = new ApiClient();
api.onRegionBlocked = (message) => useRegion.getState().block(message);
export const realtime = new RealtimeClient(api);
