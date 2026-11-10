import 'package:flutter/material.dart';

import '../../core/api/live_banners.dart';
import '../../core/theme/vibe_theme.dart';
import '../../services/push/push_route.dart';
import 'notification_style.dart';

/// The live notification banner over every screen (web: LiveBannerHost):
/// a message, a payment, a cash-out, a friend request… while you're in the
/// app. Tap opens it; swipe it up or × to close.
class LiveBannerOverlay extends StatelessWidget {
  const LiveBannerOverlay({super.key, required this.banners, required this.child});
  final LiveBanners banners;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SafeArea(
            bottom: false,
            child: ListenableBuilder(
              listenable: banners,
              builder: (context, _) {
                final b = banners.current;
                return AnimatedSwitcher(
                  duration: const Duration(milliseconds: 300),
                  transitionBuilder: (c, a) => SlideTransition(
                    position: Tween(begin: const Offset(0, -0.4), end: Offset.zero).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
                    child: FadeTransition(opacity: a, child: c),
                  ),
                  child: b == null ? const SizedBox(key: ValueKey('none')) : _Card(key: ValueKey(b.id), b: b, banners: banners),
                );
              },
            ),
          ),
        ),
      ],
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({super.key, required this.b, required this.banners});
  final LiveBanner b;
  final LiveBanners banners;

  @override
  Widget build(BuildContext context) {
    final style = NotificationStyle.of(b.key, b.title);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Dismissible(
            key: ValueKey('d${b.id}'),
            direction: DismissDirection.up,
            onDismissed: (_) => banners.dismiss(),
            child: Material(
              color: V.surface.withValues(alpha: 0.96),
              elevation: 12,
              shadowColor: Colors.black54,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: V.lineStrong)),
              child: InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () {
                  banners.dismiss();
                  DeepLinks.open(b.data);
                },
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 10, 4, 10),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(color: style.color.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(13)),
                        child: Icon(style.icon, size: 21, color: style.color),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(b.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(14, weight: FontWeight.w700)),
                            if (b.body.isNotEmpty) Text(b.body, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.body(12.5, color: V.text2, height: 1.35)),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close',
                        onPressed: banners.dismiss,
                        icon: const Icon(Icons.close_rounded, size: 18, color: V.muted),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
