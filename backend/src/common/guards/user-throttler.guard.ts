import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackedRequest {
  user?: { id: string };
  staff?: { id: string };
  ips?: string[];
  ip?: string;
}

/** Rate-limit per signed-in user or staff member when we know them, per IP otherwise. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const r = req as TrackedRequest;
    if (r.staff?.id) return `s:${r.staff.id}`;
    return r.user?.id ? `u:${r.user.id}` : `ip:${r.ips?.length ? r.ips[0] : r.ip}`;
  }
}
