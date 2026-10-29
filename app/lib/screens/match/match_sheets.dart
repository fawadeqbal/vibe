import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';

// ── Camera blocked ─────────────────────────────────────────────────────────

/// What the camera sheet ends with.
enum CameraFix { retry, later }

/// "Vibe can't use your camera": steps to allow it again, Open Settings when
/// the phone won't ask any more, and Try again.
Future<CameraFix?> showCameraBlocked(BuildContext context) => showVibeSheet<CameraFix>(context, child: const CameraBlockedSheet());

class CameraBlockedSheet extends StatefulWidget {
  const CameraBlockedSheet({super.key, this.checkPermissions = true});

  /// Off in tests (no platform channel there).
  final bool checkPermissions;

  @override
  State<CameraBlockedSheet> createState() => _CameraBlockedSheetState();
}

class _CameraBlockedSheetState extends State<CameraBlockedSheet> {
  /// The phone won't show the "Allow camera?" prompt again: only Settings can.
  bool _settingsOnly = true;

  @override
  void initState() {
    super.initState();
    if (widget.checkPermissions) _check();
  }

  Future<void> _check() async {
    try {
      final cam = await Permission.camera.status;
      final mic = await Permission.microphone.status;
      final canAsk = !cam.isPermanentlyDenied && !mic.isPermanentlyDenied && !cam.isRestricted;
      if (mounted) setState(() => _settingsOnly = !canAsk);
    } catch (_) {}
  }

  Future<void> _allow() async {
    try {
      if (_settingsOnly) {
        await openAppSettings();
        return;
      }
      final r = await [Permission.camera, Permission.microphone].request();
      final ok = r.values.every((s) => s.isGranted || s.isLimited);
      if (!mounted) return;
      if (ok) {
        Navigator.of(context).pop(CameraFix.retry);
      } else {
        setState(() => _settingsOnly = true);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final steps = _settingsOnly
        ? const ['Tap Open Settings below', 'Turn on Camera and Microphone for Vibe', "Come back and tap I've allowed it"]
        : const ['Tap Allow camera below', 'Choose Allow for Camera and Microphone'];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          _badge(Icons.videocam_off_rounded),
          const SizedBox(width: 10),
          _badge(Icons.mic_off_rounded),
        ]),
        const SizedBox(height: 16),
        Text("Vibe can't use your camera", style: VT.title(22, weight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text('Camera and microphone are off for Vibe. Turn them back on to start matching — it takes a few seconds.', style: VT.body(14, color: V.text2, height: 1.5)),
        const SizedBox(height: 16),
        for (final (i, s) in steps.indexed)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: const BoxDecoration(color: V.violet, shape: BoxShape.circle),
                child: Text('${i + 1}', style: VT.label(13, color: Colors.white, weight: FontWeight.w700)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Text(s, style: VT.body(14))),
            ]),
          ),
        const SizedBox(height: 10),
        GradientButton(label: _settingsOnly ? 'Open Settings' : 'Allow camera', onTap: _allow),
        const SizedBox(height: 8),
        GhostButton(label: _settingsOnly ? "I've allowed it — try again" : 'Try again', expand: true, onTap: () => Navigator.of(context).pop(CameraFix.retry)),
        TextButton(onPressed: () => Navigator.of(context).pop(CameraFix.later), child: Text('Not now', style: VT.label(14, color: V.text2))),
        Text('Nothing is recorded. Your video goes only to the person you talk to.', textAlign: TextAlign.center, style: VT.body(12.5, color: V.text2)),
      ]),
    );
  }

  Widget _badge(IconData icon) => Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(color: V.bad.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(16)),
        child: Icon(icon, size: 24, color: V.bad),
      );
}

// ── A filter you can't afford ─────────────────────────────────────────────

enum FilterCoinsChoice { store, ad, vip, anyone }

/// "This filter costs N coins": get coins, watch a video, VIP, or match with anyone for free.
Future<FilterCoinsChoice?> showFilterCoins(BuildContext context, {required int cost, required int coins, required String filterLabel, required bool adsAvailable}) =>
    showVibeSheet<FilterCoinsChoice>(context, child: FilterCoinsSheet(cost: cost, coins: coins, filterLabel: filterLabel, adsAvailable: adsAvailable));

class FilterCoinsSheet extends StatelessWidget {
  const FilterCoinsSheet({super.key, required this.cost, required this.coins, required this.filterLabel, required this.adsAvailable});
  final int cost;
  final int coins;
  final String filterLabel;
  final bool adsAvailable;

  @override
  Widget build(BuildContext context) {
    Widget row(FilterCoinsChoice c, IconData icon, Color tint, String title, {String? sub, bool highlight = false}) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Material(
            color: highlight ? V.gold.withValues(alpha: 0.1) : V.surface2,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: highlight ? V.gold.withValues(alpha: 0.45) : Colors.white.withValues(alpha: 0.1))),
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => Navigator.of(context).pop(c),
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 56),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  child: Row(children: [
                    Icon(icon, size: 20, color: tint),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                        Text(title, style: VT.title(15, weight: FontWeight.w600)),
                        if (sub != null) Text(sub, style: VT.body(12, color: V.text2)),
                      ]),
                    ),
                    const Icon(SolarIconsOutline.altArrowRight, size: 18, color: V.text2),
                  ]),
                ),
              ),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: V.pink.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(999)),
            child: Text(filterLabel, style: VT.label(13, color: V.pinkSoft, weight: FontWeight.w700)),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: V.gold.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(999)),
            child: Text('You have $coins', style: VT.label(13, color: V.gold, weight: FontWeight.w700)),
          ),
        ]),
        const SizedBox(height: 14),
        Headline('This filter costs ', accent: '$cost coins', accentColor: V.gold, size: 24),
        const SizedBox(height: 6),
        Text("You only pay when you're matched. Matching with anyone is always free.", style: VT.body(14, color: V.text2, height: 1.5)),
        const SizedBox(height: 16),
        row(FilterCoinsChoice.store, SolarIconsBold.dollarMinimalistic, V.gold, 'Get coins', highlight: true),
        if (adsAvailable) row(FilterCoinsChoice.ad, SolarIconsBold.videoFrame, V.lavender, 'Watch a short video for free coins'),
        row(FilterCoinsChoice.vip, SolarIconsBold.crown, V.gold, 'VIP — every filter free', sub: 'Plus unlimited likes in Discover'),
        const SizedBox(height: 8),
        GradientButton(label: 'Match with anyone — free', onTap: () => Navigator.of(context).pop(FilterCoinsChoice.anyone)),
      ]),
    );
  }
}

// ── Skipping too fast ─────────────────────────────────────────────────────

enum CooldownChoice { next, pay }

/// "Take a breath": a countdown, a tip, and paying to skip it. Reaching zero
/// closes with [CooldownChoice.next] (they asked for the next person).
Future<CooldownChoice?> showCooldown(BuildContext context, {required DateTime until, required int bypassCost, required int skipped}) =>
    showVibeSheet<CooldownChoice>(context, child: CooldownSheet(until: until, bypassCost: bypassCost, skipped: skipped));

class CooldownSheet extends StatefulWidget {
  const CooldownSheet({super.key, required this.until, required this.bypassCost, required this.skipped});
  final DateTime until;
  final int bypassCost;
  final int skipped;

  @override
  State<CooldownSheet> createState() => _CooldownSheetState();
}

class _CooldownSheetState extends State<CooldownSheet> {
  Timer? _tick;
  late final int _total = math.max(1, (widget.until.difference(DateTime.now()).inMilliseconds / 1000).ceil());
  bool _done = false;

  int get _left => math.max(0, (widget.until.difference(DateTime.now()).inMilliseconds / 1000).ceil());

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) return;
      setState(() {});
      if (_left == 0 && !_done) {
        _done = true;
        _tick?.cancel();
        Navigator.of(context).pop(CooldownChoice.next);
      }
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = _left;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Semantics(
          liveRegion: true,
          label: '$left seconds',
          excludeSemantics: true,
          child: SizedBox(
            width: 124,
            height: 124,
            child: Stack(alignment: Alignment.center, children: [
              SizedBox(
                width: 112,
                height: 112,
                child: CircularProgressIndicator(value: left / _total, strokeWidth: 9, color: V.gold, backgroundColor: V.surface2, strokeCap: StrokeCap.round),
              ),
              Column(mainAxisSize: MainAxisSize.min, children: [
                Text('$left', style: VT.display(38)),
                Text('seconds', style: VT.label(11, color: V.text2)),
              ]),
            ]),
          ),
        ),
        const SizedBox(height: 14),
        Headline('Take a ', accent: 'breath', accentColor: V.gold, size: 26, textAlign: TextAlign.center),
        const SizedBox(height: 6),
        Text("You skipped ${widget.skipped} people in a row. We'll find the next one in a moment.", textAlign: TextAlign.center, style: VT.body(14, color: V.text2, height: 1.5)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(18)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(SolarIconsOutline.lightbulb, size: 20, color: V.lavender),
            const SizedBox(width: 12),
            Expanded(child: Text('Give the next person 10 seconds — say hi and ask one question. A real hello is how likes and friends start.', style: VT.body(13.5, height: 1.5))),
          ]),
        ),
        const SizedBox(height: 18),
        GhostButton(label: 'Skip the wait · ${widget.bypassCost} coins', icon: SolarIconsBold.bolt, expand: true, onTap: () => Navigator.of(context).pop(CooldownChoice.pay)),
        TextButton(onPressed: () => Navigator.of(context).pop(), child: Text('Keep talking', style: VT.label(14, color: V.text2))),
      ]),
    );
  }
}
