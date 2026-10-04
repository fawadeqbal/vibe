import type { NextRequest } from "next/server";

import { forwardLogin } from "@/lib/server/login";

export async function POST(req: NextRequest) {
  return forwardLogin(req, "login");
}
