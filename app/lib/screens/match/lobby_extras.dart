import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../providers/engagement_provider.dart';
import '../../providers/social_provider.dart';
import '../profile/wellbeing_section.dart' show clockLabel;
import '../social/chat_screen.dart';

/// "42:10" / "1:02:03".
String countdown(Duration d) {
  final s = d.inSeconds < 0 ? 0 : d.inSeconds;
  final h = s ~/ 3600;
  final mm = ((s % 3600) ~/ 60).toString().padLeft(h > 0 ? 2 : 1, '0');
  final ss = (s % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
}

/// Lobby pill: "Vibe Hour · free filters · 42:10 left" while it runs, and
/// "Vibe Hour starts at 9:00 PM" in the two hours before. Ticks once a
/// second only while it is on screen.
class VibeHourBanner extends StatefulWidget {
  const VibeHourBanner({super.key});

  @override
  State<VibeHourBanner> createState() => _VibeHourBannerState();
}

class _VibeHourBannerState extends State<VibeHourBanner> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = context.watch<EngagementProvider>();
    final v = e.vibeHour;
    final now = e.now;
    if (v.activeAt(now)) {
      final left = v.endsAt!.difference(now);
      return Semantics(
        liveRegion: false,
        label: 'Vibe Hour, free filters, ${left.inMinutes} minutes left',
        excludeSemantics: true,
        child: Container(
          height: 36,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(gradient: V.brandSoft, borderRadius: BorderRadius.circular(18), border: Border.all(color: V.pink.withValues(alpha: 0.5))),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.local_fire_department_rounded, size: 17, color: V.pinkSoft),
              const SizedBox(width: 6),
              Flexible(child: Text('Vibe Hour · free filters · ', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(12.5, color: Colors.white))),
              Text(countdown(left), style: VT.mono(12.5, color: Colors.white, weight: FontWeight.w600)),
              Text(' left', style: VT.label(12.5, color: Colors.white)),
            ],
          ),
        ),
      );
    }
    if (v.startsSoon(now)) {
      final at = v.startsAt!;
      return GlassPill(icon: Icons.schedule_rounded, iconColor: V.pinkSoft, height: 34, label: 'Vibe Hour starts at ${clockLabel(at.hour * 60 + at.minute)} · free filters');
    }
    return const SizedBox.shrink();
  }
}

/// "3 friends online" with up to five faces; a face opens that chat. Only
/// in the idle lobby (the caller hides it while searching or in a call).
class FriendsOnlineRow extends StatelessWidget {
  const FriendsOnlineRow({super.key});

  @override
  Widget build(BuildContext context) {
    final online = context.select<SocialProvider, List<Friend>>((s) => s.onlineFriends);
    if (online.isEmpty) return const SizedBox.shrink();
    final shown = online.take(5).toList();
    return Glass(
      radius: 24,
      color: V.bg2.withValues(alpha: 0.45),
      padding: const EdgeInsets.fromLTRB(6, 5, 14, 5),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final f in shown)
            Semantics(
              button: true,
              label: 'Chat with ${f.profile.name}',
              excludeSemantics: true,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(friendId: f.profile.id))),
                child: Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: Stack(
                    children: [
                      VAvatar(url: f.profile.avatarUrl, name: f.profile.name, size: 30),
                      Positioned(right: 0, bottom: 0, child: Container(width: 10, height: 10, decoration: BoxDecoration(shape: BoxShape.circle, color: V.ok, border: Border.all(color: V.bg, width: 2)))),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(width: 6),
          Text('${online.length} ${online.length == 1 ? 'friend' : 'friends'} online', style: VT.label(12.5, color: Colors.white)),
        ],
      ),
    );
  }
}
