import { ApiClient } from "@/lib/api/client";
import { RealtimeClient } from "@/lib/api/realtime";

/** The one API client and socket for the whole app (Flutter's AppServices). */
export const api = new ApiClient();
export const realtime = new RealtimeClient(api);
