import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/mock/mock_data.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/discover.dart';

/// One filter that's on, with what turning it off sets.
class ActiveFilter {
  const ActiveFilter(this.key, this.label, this.without);
  final String key;
  final String label;
  final DiscoverFilters without;
}

/// The filters that narrow the deck, each removable on its own (same list as the web).
List<ActiveFilter> activeFilters(DiscoverFilters f) {
  const d = DiscoverFilters();
  String country(String code) {
    for (final c in MockData.countries) {
      if (c.code == code) return c.name;
    }
    return code;
  }

  return [
    if (f.onlineOnly) ActiveFilter('online', 'Online now', f.copyWith(onlineOnly: false)),
    if (f.countryCode.isNotEmpty) ActiveFilter('country', country(f.countryCode), f.copyWith(countryCode: '')),
    if (f.gender != WantedGender.anyone) ActiveFilter('gender', f.gender == WantedGender.women ? 'Women' : 'Men', f.copyWith(gender: WantedGender.anyone)),
    if (f.verifiedOnly) ActiveFilter('verified', 'Verified only', f.copyWith(verifiedOnly: false)),
    if (f.minAge != d.minAge || f.maxAge != d.maxAge) ActiveFilter('age', 'Ages ${f.minAge}–${f.maxAge}', f.copyWith(minAge: d.minAge, maxAge: d.maxAge)),
  ];
}

/// Every state that replaces the deck (empty, offline, no photo…) sits in
/// the same frame, the size of a card: icon, headline, a line of text, then
/// the buttons. Centred when it fits; scrolls when the screen is short.
class _StateFrame extends StatelessWidget {
  const _StateFrame({required this.label, required this.children});
  final String label;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: label,
      child: Container(
        decoration: BoxDecoration(
          color: V.surface,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: V.line),
        ),
        clipBehavior: Clip.antiAlias,
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 24),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight - 48),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 340),
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

enum _Tone { pink, violet, muted }

/// The round icon at the top of every state.
class _StateIcon extends StatelessWidget {
  const _StateIcon(this.icon, {this.tone = _Tone.muted});
  final IconData icon;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (tone) {
      _Tone.pink => (V.pink.withValues(alpha: 0.14), V.pink),
      _Tone.violet => (V.lavender.withValues(alpha: 0.14), V.lavender),
      _Tone.muted => (Colors.white.withValues(alpha: 0.08), V.text2),
    };
    return Center(
      child: ExcludeSemantics(
        child: Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: Icon(icon, size: 32, color: fg),
        ),
      ),
    );
  }
}

/// Headline, then a line of text: the same in every state.
List<Widget> _title(String text, String accent, Color color, String body) => [
  const SizedBox(height: 18),
  Headline(text, accent: accent, accentColor: color, size: 24, textAlign: TextAlign.center),
  const SizedBox(height: 6),
  Text(
    body,
    textAlign: TextAlign.center,
    style: VT.body(14, color: V.text2, height: 1.5),
  ),
  const SizedBox(height: 20),
];

/// While the deck loads: the shape of a card, not a spinner. After a while it
/// says so and offers a retry instead of looking stuck.
class DeckSkeleton extends StatefulWidget {
  const DeckSkeleton({super.key, this.label = 'Finding people for you…', this.slow = false, this.onRetry});
  final String label;
  final bool slow;
  final VoidCallback? onRetry;

  @override
  State<DeckSkeleton> createState() => _DeckSkeletonState();
}

class _DeckSkeletonState extends State<DeckSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget bar(double w, double h, [double r = 8]) => Container(
      width: w,
      height: h,
      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(r)),
    );
    final reduce = MediaQuery.of(context).disableAnimations;
    final slow = widget.slow;
    Widget line(double f, double h, [double r = 8]) => FractionallySizedBox(
          widthFactor: f,
          alignment: Alignment.centerLeft,
          child: Container(height: h, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.07), borderRadius: BorderRadius.circular(r))),
        );
    return Semantics(
      liveRegion: true,
      label: slow ? 'Taking longer than usual' : widget.label,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [V.surface2, V.surface]),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Positioned(
              left: 18,
              right: 18,
              bottom: 22,
              child: FadeTransition(
                opacity: reduce ? const AlwaysStoppedAnimation(1) : Tween(begin: 0.55, end: 1.0).animate(_c),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    line(0.6, 30, 10),
                    const SizedBox(height: 12),
                    line(0.45, 14, 7),
                    const SizedBox(height: 10),
                    line(0.9, 14, 7),
                    const SizedBox(height: 12),
                    Row(children: [bar(70, 28, 999), const SizedBox(width: 6), bar(80, 28, 999), const SizedBox(width: 6), bar(64, 28, 999)]),
                  ],
                ),
              ),
            ),
            Align(
              alignment: const Alignment(0, -0.1),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(slow ? 'Taking longer than usual…' : widget.label, textAlign: TextAlign.center, style: VT.body(13.5, color: V.muted)),
                    if (slow && widget.onRetry != null) ...[
                      const SizedBox(height: 12),
                      GhostButton(label: 'Try again', icon: SolarIconsOutline.refresh, height: 44, onTap: widget.onRetry),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The deck couldn't load: offline or the server didn't answer.
class DeckOffline extends StatelessWidget {
  const DeckOffline({super.key, required this.offline, required this.onRetry});
  final bool offline;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return _StateFrame(
      label: offline ? "You're offline" : "Can't reach Vibe",
      children: [
        _StateIcon(offline ? Icons.wifi_off_rounded : Icons.cloud_off_rounded),
        ..._title(
          offline ? "You're " : "Can't reach ",
          offline ? 'offline' : 'Vibe',
          V.pinkSoft,
          offline ? "Discover needs the internet to show people. We'll load them as soon as you're back." : 'Something went wrong on our side. Give it a moment and try again.',
        ),
        GhostButton(label: 'Try again', icon: SolarIconsOutline.refresh, expand: true, onTap: onRetry),
        const SizedBox(height: 12),
        Text(
          'Your likes and matches are safe.',
          textAlign: TextAlign.center,
          style: VT.body(12.5, color: V.muted),
        ),
      ],
    );
  }
}

/// No photo: nobody can see you. Add one, or just look around.
class NoPhotoPanel extends StatelessWidget {
  const NoPhotoPanel({super.key, required this.onAddPhoto, required this.onLookAround});
  final VoidCallback onAddPhoto;
  final VoidCallback onLookAround;

  @override
  Widget build(BuildContext context) {
    return _StateFrame(
      label: 'Add a photo to be seen',
      children: [
        const _StateIcon(SolarIconsBold.galleryAdd, tone: _Tone.violet),
        ..._title('Add a photo ', 'to be seen', V.pinkSoft, 'Discover shows people with a photo. Add one of your face and others can find you here too. You can still look around.'),
        GradientButton(label: 'Add a photo', icon: SolarIconsBold.camera, height: 54, onTap: onAddPhoto),
        const SizedBox(height: 10),
        GhostButton(label: 'Look around', height: 48, expand: true, onTap: onLookAround),
      ],
    );
  }
}

class DeckEmpty extends StatelessWidget {
  const DeckEmpty({super.key, required this.filters, required this.onSetFilters, required this.onEditFilters, this.onMeetLive, this.notifyOn, this.onNotify});
  final DiscoverFilters filters;
  final ValueChanged<DiscoverFilters> onSetFilters;
  final VoidCallback onEditFilters;
  final VoidCallback? onMeetLive;

  /// "Tell me when new people join": on, off, or not known yet (hidden).
  final bool? notifyOn;
  final ValueChanged<bool>? onNotify;

  @override
  Widget build(BuildContext context) {
    final active = activeFilters(filters);
    if (active.isNotEmpty) {
      return _StateFrame(
        label: 'No one fits these filters',
        children: [
          const _StateIcon(SolarIconsBold.filter, tone: _Tone.violet),
          ..._title('No one fits ', 'all of these', V.lavender, 'Your filters are hiding everyone right now. Tap one to remove it.').take(4),
          const SizedBox(height: 16),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final a in active)
                Tooltip(
                  message: 'Remove ${a.label}',
                  excludeFromSemantics: true,
                  child: Semantics(
                  button: true,
                  label: 'Remove ${a.label}',
                  excludeSemantics: true,
                  child: Material(
                    color: V.surface,
                    shape: const StadiumBorder(),
                    child: InkWell(
                      customBorder: const StadiumBorder(),
                      onTap: () => onSetFilters(a.without),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 9, 10, 9),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(a.label, style: VT.label(13, weight: FontWeight.w600)),
                            const SizedBox(width: 6),
                            const Icon(Icons.close_rounded, size: 16, color: V.text2),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          GradientButton(label: 'Show everyone', onTap: () => onSetFilters(const DiscoverFilters())),
          const SizedBox(height: 8),
          GhostButton(label: 'Edit filters', icon: SolarIconsOutline.tuning, expand: true, onTap: onEditFilters),
        ],
      );
    }
    return _StateFrame(
      label: "You're all caught up",
      children: [
        const _StateIcon(SolarIconsBold.checkCircle, tone: _Tone.pink),
        ..._title("You're all caught up ", 'for now', V.pinkSoft, "You've seen everyone who fits your filters. New people join all day."),
        if (onMeetLive != null) ...[GradientButton(label: 'Meet someone live', icon: SolarIconsBold.videocamera, height: 54, onTap: onMeetLive), const SizedBox(height: 10)],
        GhostButton(label: 'Change filters', icon: SolarIconsOutline.tuning, height: 48, expand: true, onTap: onEditFilters),
        if (notifyOn != null && onNotify != null) ...[
          const SizedBox(height: 10),
          if (notifyOn!)
            Semantics(
              liveRegion: true,
              child: Wrap(
                alignment: WrapAlignment.center,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const Icon(SolarIconsBold.bell, size: 16, color: V.ok),
                  const SizedBox(width: 6),
                  Text("We'll tell you when new people join", style: VT.body(13, color: V.text2)),
                  TextButton(
                    onPressed: () => onNotify!(false),
                    child: Text('Turn off', style: VT.label(13, weight: FontWeight.w700)),
                  ),
                ],
              ),
            )
          else
            TextButton.icon(
              onPressed: () => onNotify!(true),
              icon: const Icon(SolarIconsOutline.bell, size: 17, color: V.lavender),
              label: Text(
                'Tell me when new people join',
                style: VT.label(13.5, color: V.lavender, weight: FontWeight.w600),
              ),
            ),
        ],
      ],
    );
  }
}

/// Discover is switched off for a while (admin): the same frame as every other state.
class DeckResting extends StatelessWidget {
  const DeckResting({super.key, this.onMeetLive});
  final VoidCallback? onMeetLive;

  @override
  Widget build(BuildContext context) {
    return _StateFrame(
      label: 'Discover is resting',
      children: [
        const _StateIcon(SolarIconsBold.moonSleep, tone: _Tone.violet),
        ..._title('Discover is ', 'resting', V.lavender, "It's switched off for a little while. Your matches and chats are all still here."),
        if (onMeetLive != null) GradientButton(label: 'Meet someone live', icon: SolarIconsBold.videocamera, onTap: onMeetLive),
      ],
    );
  }
}

/// Back after a few days: what happened while you were away. Pops "liked" to see who liked you.
class WelcomeBackSheet extends StatelessWidget {
  const WelcomeBackSheet({super.key, required this.awayDays, required this.likesSince, required this.newPeople, this.freeLikes});
  final int awayDays;
  final int likesSince;
  final int newPeople;
  final int? freeLikes;

  @override
  Widget build(BuildContext context) {
    Widget row(IconData icon, Color tint, String text) => Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: tint.withValues(alpha: 0.16), shape: BoxShape.circle),
              child: Icon(icon, size: 19, color: tint),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(text, style: VT.body(14.5, weight: FontWeight.w600))),
          ]),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Headline('Welcome ', accent: 'back', accentColor: V.pinkSoft, size: 26),
        const SizedBox(height: 6),
        Text("Here's what happened in the $awayDays days you were away.", style: VT.body(14, color: V.text2)),
        const SizedBox(height: 16),
        if (likesSince > 0) row(SolarIconsBold.heart, V.pinkSoft, '$likesSince ${likesSince == 1 ? 'person' : 'people'} liked you'),
        if (newPeople > 0) row(SolarIconsBold.userPlus, V.lavender, '$newPeople new ${newPeople == 1 ? 'person' : 'people'} to see'),
        if ((freeLikes ?? 0) > 0) row(SolarIconsBold.bolt, V.gold, 'Your $freeLikes free likes are ready'),
        const SizedBox(height: 12),
        GradientButton(label: 'Start swiping', onTap: () => Navigator.of(context).pop('swipe')),
        if (likesSince > 0) ...[
          const SizedBox(height: 8),
          GhostButton(label: 'See who liked you', icon: SolarIconsBold.heart, expand: true, onTap: () => Navigator.of(context).pop('liked')),
        ],
      ]),
    );
  }
}

/// No likes left today: when they come back, and the way to get more.
class OutOfLikesBanner extends StatelessWidget {
  const OutOfLikesBanner({super.key, required this.resetsAt, required this.onMore, this.packSize = 30, this.packCost = 20});
  final DateTime? resetsAt;
  final VoidCallback onMore;
  final int packSize;
  final int packCost;

  @override
  Widget build(BuildContext context) {
    final r = resetsAt?.toLocal();
    final until = r == null ? null : TimeOfDay.fromDateTime(r).format(context);
    return Semantics(
      liveRegion: true,
      child: Container(
        margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(18), border: Border.all(color: V.pink.withValues(alpha: 0.3))),
        child: Row(children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
            child: const Icon(SolarIconsOutline.clockCircle, size: 22, color: V.pinkSoft),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(until == null ? 'Out of likes for today' : 'Out of likes until $until', style: VT.title(14.5, weight: FontWeight.w700)),
              Text('$packSize more for $packCost coins, or unlimited with VIP', style: VT.body(12, color: V.text2)),
            ]),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: onMore,
            child: Container(
              height: 34,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(gradient: V.brand, borderRadius: BorderRadius.circular(999)),
              child: Center(widthFactor: 1, child: Text('Get more', style: VT.label(13, color: Colors.white, weight: FontWeight.w700))),
            ),
          ),
        ]),
      ),
    );
  }
}
