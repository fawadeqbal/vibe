import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/social_provider.dart';
import '../social/chat_screen.dart';

/// "42:10" / "1:02:03".
String countdown(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  final h = s ~/ 3600;
  final mm = ((s % 3600) ~/ 60).toString().padLeft(h > 0 ? 2 : 1, '0');
  final ss = (s % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}

/// "9:00 PM" (the web's `clock12`).
String clock12(DateTime t) {
  final h = t.hour;
  return '${h % 12 == 0 ? 12 : h % 12}:${t.minute.toString().padLeft(2, '0')} ${h < 12 ? 'AM' : 'PM'}';
}

/// Rebuilds every [every] while on screen.
mixin _Ticking<T extends StatefulWidget> on State<T> {
  Timer? _tick;
  Duration get every;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(every, (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }
}

/// Vibe Hour in the lobby while it's live: "Vibe Hour · free filters · 42:10
/// left". Before it, [VibeHourInvite] says when and offers a reminder.
/// (web: features/match/lobby-extras.tsx)
class VibeHourBanner extends StatefulWidget {
  const VibeHourBanner({super.key});

  @override
  State<VibeHourBanner> createState() => _VibeHourBannerState();
}

class _VibeHourBannerState extends State<VibeHourBanner> with _Ticking {
  @override
  Duration get every => const Duration(seconds: 1);

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final v = e.vibeHour;
    final now = e.now;
    if (!v.activeAt(now)) return const SizedBox.shrink();
    final left = v.endsAt!.difference(now);
    final white = VT.label(12.5, color: Colors.white);
    return Semantics(
      label: 'Vibe Hour: filters are free, ${countdown(left)} left',
      excludeSemantics: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            height: 32,
            padding: const EdgeInsets.only(left: 10, right: 12),
            decoration: BoxDecoration(gradient: V.brandSoft, borderRadius: BorderRadius.circular(16), border: Border.all(color: V.pink.withValues(alpha: 0.45))),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(SolarIconsBold.fire, size: 16, color: V.pinkSoft),
                const SizedBox(width: 6),
                Text.rich(
                  TextSpan(
                    style: white,
                    children: [
                      const TextSpan(text: 'Vibe Hour · free filters · '),
                      TextSpan(text: countdown(left), style: VT.number(12.5, color: Colors.white)),
                      const TextSpan(text: ' left'),
                    ],
                  ),
                  maxLines: 1,
                  softWrap: false,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// "in 3 h 20 min", "in 12 min".
String untilLabel(Duration d) {
  final m = d.inMinutes < 1 ? 1 : (d.inSeconds / 60).round();
  if (m < 60) return 'in $m min';
  final h = m ~/ 60;
  final rest = m % 60;
  return rest > 0 ? 'in $h h $rest min' : 'in $h h';
}

/// Turns "Remind me" on/off with a toast saying what happens next.
Future<void> toggleVibeHourReminder(BuildContext context, bool on, DateTime? startsAt) async {
  final ok = await context.read<EngagementProvider>().setVibeHourReminder(on);
  if (!context.mounted) return;
  if (!ok) return toast(context, "Couldn't save that. Try again.", error: true);
  toast(context, on ? "We'll remind you before ${startsAt != null ? clock12(startsAt) : 'Vibe Hour'}" : 'Vibe Hour reminder off');
}

/// Outside Vibe Hour, says when everyone's on and offers to remind you, so a
/// quiet moment ends with a reason to come back. Hidden while it's live (the
/// live banner takes over) or when Vibe Hour is switched off.
/// (web: features/engagement/vibe-hour-invite.tsx, compact)
class VibeHourInvite extends StatefulWidget {
  const VibeHourInvite({super.key});

  @override
  State<VibeHourInvite> createState() => _VibeHourInviteState();
}

class _VibeHourInviteState extends State<VibeHourInvite> with _Ticking {
  @override
  Duration get every => const Duration(seconds: 30);

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final v = e.vibeHour;
    final startsAt = v.startsAt;
    if (startsAt == null || v.activeAt(e.now)) return const SizedBox.shrink();
    final remind = e.vibeHourReminder;
    return Glass(
      radius: 20,
      height: 40,
      border: Colors.white.withValues(alpha: 0.14),
      padding: const EdgeInsets.only(left: 12, right: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(SolarIconsBold.fire, size: 16, color: V.pinkSoft),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              "Everyone's on at ${clock12(startsAt)}",
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: VT.label(12.5, color: Colors.white.withValues(alpha: 0.9)),
            ),
          ),
          const SizedBox(width: 8),
          Semantics(
            button: true,
            toggled: remind,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => unawaited(toggleVibeHourReminder(context, !remind, startsAt)),
              child: Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(color: remind ? V.pink.withValues(alpha: 0.18) : Colors.white, borderRadius: BorderRadius.circular(16)),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(remind ? SolarIconsBold.bellBing : SolarIconsOutline.bell, size: 15, color: remind ? V.pinkSoft : V.bg),
                    const SizedBox(width: 4),
                    Text(remind ? 'Reminder on' : 'Remind me', style: VT.label(12.5, color: remind ? V.pinkSoft : V.bg, weight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "3 friends online" with up to five faces; each face opens that chat.
/// Hidden when nobody is on. (web: features/match/lobby-extras.tsx)
class FriendsOnlineRow extends StatelessWidget {
  const FriendsOnlineRow({super.key});

  @override
  Widget build(BuildContext context) {
    final online = context.select<SocialProvider, List<Friend>>((s) => s.onlineFriends);
    if (online.isEmpty) return const SizedBox.shrink();
    final shown = online.take(5).toList();
    void open(Friend f) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id)));
    return Glass(
      radius: 22,
      height: 44,
      color: V.bg2.withValues(alpha: 0.45),
      padding: const EdgeInsets.only(left: 6, right: 14),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 34 + (shown.length - 1) * 24.0,
            height: 34,
            child: Stack(
              children: [
                // Later faces tuck under earlier ones (the first is on top).
                for (var i = shown.length - 1; i >= 0; i--)
                  Positioned(
                    left: i * 24.0,
                    child: Semantics(
                      button: true,
                      label: 'Chat with ${shown[i].profile.name}',
                      excludeSemantics: true,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => open(shown[i]),
                        child: Container(
                          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: V.bg2, width: 2)),
                          child: Stack(
                            clipBehavior: Clip.none,
                            children: [
                              VAvatar(url: shown[i].profile.avatarUrl, name: shown[i].profile.name, size: 30),
                              Positioned(
                                right: -2,
                                bottom: -2,
                                child: Container(
                                  width: 10,
                                  height: 10,
                                  decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg2, width: 2)),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: GestureDetector(
              onTap: online.length == 1 ? () => open(online.first) : null,
              child: Text(
                online.length == 1 ? '${online.first.profile.name} is online' : '${online.length} friends online',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: VT.label(12.5, color: Colors.white.withValues(alpha: 0.9)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
