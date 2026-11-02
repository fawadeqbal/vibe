import { HttpStatus, Injectable } from '@nestjs/common';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Clock, MS } from '../../common/utils/clock';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** The AppSetting row with the Android download link set in Admin → Configuration. */
export const APP_DOWNLOAD_KEY = 'app.download';
const RELOAD_MS = 30_000;

export interface AppDownloadView {
  /** Where "Download for Android" sends people now. */
  androidUrl: string;
  /** admin = set in Configuration; default = the server's APK_DOWNLOAD_URL (latest GitHub release). */
  source: 'admin' | 'default';
  defaultUrl: string;
  updatedAt: string | null;
  updatedBy: string | null;
  downloads: { last7Days: number; allTime: number };
}

type Fetch = typeof fetch;

/**
 * Where every "Download for Android" button ends up. Staff can point it at
 * any https link to an .apk from Admin → Configuration; the link is checked
 * (it must download a real APK) before it is saved.
 */
@Injectable()
export class AppDownloadService {
  private cached: { url: string | null; at: number } | null = null;
  /** Swapped in tests. */
  fetchImpl: Fetch = (...a) => fetch(...a);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  private get defaultUrl(): string {
    return this.config.get('APK_DOWNLOAD_URL');
  }

  private async stored() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: APP_DOWNLOAD_KEY } });
    const url = (row?.value as { androidUrl?: string } | null)?.androidUrl;
    return row && url ? { url, updatedAt: row.updatedAt, updatedById: row.updatedById } : null;
  }

  /** The link the download endpoint redirects to. */
  async androidUrl(): Promise<string> {
    if (!this.cached || Date.now() - this.cached.at > RELOAD_MS) this.cached = { url: (await this.stored())?.url ?? null, at: Date.now() };
    return this.cached.url ?? this.defaultUrl;
  }

  async view(): Promise<AppDownloadView> {
    const [s, last7, all] = await Promise.all([
      this.stored(),
      this.prisma.appDownload.count({ where: { at: { gte: new Date(this.clock.now().getTime() - 7 * MS.day) } } }),
      this.prisma.appDownload.count(),
    ]);
    const by = s?.updatedById ? await this.prisma.staffUser.findUnique({ where: { id: s.updatedById }, select: { email: true } }) : null;
    return {
      androidUrl: s?.url ?? this.defaultUrl,
      source: s ? 'admin' : 'default',
      defaultUrl: this.defaultUrl,
      updatedAt: s?.updatedAt.toISOString() ?? null,
      updatedBy: by?.email ?? null,
      downloads: { last7Days: last7, allTime: all },
    };
  }

  /** Checks the link really downloads an APK, then saves it. Null = back to the default. */
  async set(url: string | null, staffId: string): Promise<AppDownloadView> {
    if (url === null) {
      await this.prisma.appSetting.deleteMany({ where: { key: APP_DOWNLOAD_KEY } });
    } else {
      const clean = url.trim();
      await this.check(clean);
      await this.prisma.appSetting.upsert({ where: { key: APP_DOWNLOAD_KEY }, create: { key: APP_DOWNLOAD_KEY, value: { androidUrl: clean }, updatedById: staffId }, update: { value: { androidUrl: clean }, updatedById: staffId } });
    }
    this.cached = null;
    return this.view();
  }

  /**
   * Downloads the first bytes: the link must answer (following redirects)
   * and the file must start like an APK (a zip: "PK").
   */
  async check(url: string): Promise<void> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'That is not a web link.', HttpStatus.BAD_REQUEST);
    }
    if (u.protocol !== 'https:') throw new AppError(ErrorCode.VALIDATION_FAILED, 'Use an https:// link.', HttpStatus.BAD_REQUEST);
    if (u.hostname === new URL(this.config.get('PUBLIC_URL')).hostname) throw new AppError(ErrorCode.VALIDATION_FAILED, "Link to the APK file itself, not to Vibe's own download link.", HttpStatus.BAD_REQUEST);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers: { Range: 'bytes=0-3', 'User-Agent': 'vibe-api' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new AppError(ErrorCode.DOWNLOAD_LINK_BROKEN, `The link didn't answer: ${(e as Error).message}`.slice(0, 200), HttpStatus.BAD_REQUEST);
    }
    if (!res.ok) throw new AppError(ErrorCode.DOWNLOAD_LINK_BROKEN, `The link answered ${res.status} — the file isn't there (or isn't public).`, HttpStatus.BAD_REQUEST);
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 4);
    if (head[0] !== 0x50 || head[1] !== 0x4b) {
      throw new AppError(ErrorCode.DOWNLOAD_LINK_BROKEN, 'This link opens a page, not an APK file. Use the direct link to the .apk (on GitHub: right-click the .apk under the release → Copy link).', HttpStatus.BAD_REQUEST);
    }
  }
}
