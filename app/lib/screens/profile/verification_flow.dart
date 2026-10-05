import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' show MediaStream;
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/payments.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../../services/media/selfie_camera.dart';

/// Selfie verification, from anywhere (profile, safety sheet, a cash-out
/// that needs KYC): explain → the server picks the moves → guided camera
/// (front photo, then the moves) → check → result.
Future<VerificationState?> startSelfieVerification(BuildContext context) async {
  final session = context.read<SessionProvider>();
  final camera = context.read<AppServices>().selfieCamera;
  final remote = context.read<WalletProvider>().isRemote;
  try {
    VerificationState? v;
    if (camera.available) {
      final go = await showVibeSheet<bool>(context, child: const _SelfieIntro());
      if (go != true || !context.mounted) return null;
      final challenge = await session.verificationChallenge();
      if (!context.mounted) return null;
      v = await showVibeSheet<VerificationState>(
        context,
        scrollable: true,
        child: LivenessSheet(
          camera: camera,
          steps: challenge.steps,
          shared: _openFrontCamera(context),
          check: (frames) => session.verifySelfie(SelfieCheck(challengeId: challenge.id, frames: frames)),
        ),
      );
      if (v == null) return null;
    } else if (remote && !kDebugMode) {
      toast(context, 'Selfie verification needs a camera.', error: true);
      return null;
    } else {
      // Offline demo / a debug build without a camera: the dev server approves anyone with a photo.
      final challenge = await session.verificationChallenge();
      v = await session.verifySelfie(SelfieCheck(challengeId: challenge.id, frames: const []));
    }
    if (!context.mounted) return v;
    switch (v.status) {
      case VerificationStatus.approved:
        toast(context, 'Verified — badge added');
      case VerificationStatus.pending:
        toast(context, "Thanks! A person will check your selfie shortly — we'll let you know.");
      case VerificationStatus.rejected:
        toast(context, v.reason ?? 'We could not verify you. Try again in good light.', error: true);
      case VerificationStatus.none:
        break;
    }
    return v;
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
    return null;
  }
}

/// The match screen's front camera when it is already on (lobby, call): borrowed, not reopened.
MediaStream? _openFrontCamera(BuildContext context) {
  try {
    final m = context.read<MatchProvider>();
    return m.hasLocalVideo && m.camOn && m.frontCamera ? m.localStream : null;
  } on ProviderNotFoundException {
    return null;
  }
}

/// One line for the profile's verification row.
String verificationSubtitle(VerificationState v, {required bool verified}) {
  if (verified) return 'People in safe mode can match with you.';
  switch (v.status) {
    case VerificationStatus.pending:
      return "Selfie in review — we'll let you know.";
    case VerificationStatus.rejected:
      final r = (v.reason ?? 'Try again in good light').trim();
      final sentence = RegExp(r'[.!?]$').hasMatch(r) ? r : '$r.';
      return 'Not verified. $sentence${RegExp('try again', caseSensitive: false).hasMatch(r) ? '' : ' Try again.'}';
    default:
      return 'Quick selfie check. More matches, and you show up in safe mode.';
  }
}

class _SelfieIntro extends StatelessWidget {
  const _SelfieIntro();

  @override
  Widget build(BuildContext context) {
    Widget tip(IconData i, String t) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(children: [Icon(i, size: 18, color: V.trust), const SizedBox(width: 10), Expanded(child: Text(t, style: VT.body(14, color: V.text2)))]),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Icon(Icons.verified_user_rounded, size: 40, color: V.trust),
          const SizedBox(height: 10),
          Text('Take a quick selfie', textAlign: TextAlign.center, style: VT.title(20)),
          const SizedBox(height: 6),
          Text('A few seconds on camera, compared with your profile photo. It is never shown to anyone.', textAlign: TextAlign.center, style: VT.body(14, color: V.text2)),
          const SizedBox(height: 18),
          tip(Icons.wb_sunny_rounded, 'Face the light, no sunglasses or mask.'),
          tip(Icons.face_rounded, 'Just you, inside the oval.'),
          tip(Icons.swap_horiz_rounded, 'Look straight, then do the 2 moves shown.'),
          tip(Icons.photo_rounded, 'Your profile photo should show your face too.'),
          const SizedBox(height: 10),
          GradientButton(label: 'Open camera', icon: Icons.photo_camera_front_rounded, gradient: V.gemGrad, foreground: V.onGem, glow: V.gem, onTap: () => Navigator.of(context).pop(true)),
        ],
      ),
    );
  }
}

/// What each capture asks for. The preview is mirrored, so arrows point the way the face moves on screen.
({String title, IconData icon}) _stepText(LivenessStep? step) => switch (step) {
      null => (title: 'Look straight at the camera', icon: Icons.face_rounded),
      LivenessStep.turnLeft => (title: 'Turn your head to the left', icon: Icons.arrow_back_rounded),
      LivenessStep.turnRight => (title: 'Turn your head to the right', icon: Icons.arrow_forward_rounded),
      LivenessStep.tiltLeft => (title: 'Tilt your head to your left shoulder', icon: Icons.rotate_left_rounded),
      LivenessStep.tiltRight => (title: 'Tilt your head to your right shoulder', icon: Icons.rotate_right_rounded),
    };

enum _Phase { ready, capturing, checking, failed }

/// The guided selfie: a front-facing photo, then the server's moves, each taken
/// automatically after a short countdown. Pops with [check]'s result.
class LivenessSheet extends StatefulWidget {
  const LivenessSheet({super.key, required this.camera, required this.steps, required this.check, this.shared, this.secondsPerStep = 3});
  final SelfieCamera camera;
  final List<LivenessStep> steps;
  final Future<VerificationState> Function(List<List<int>> frames) check;
  final MediaStream? shared;
  final int secondsPerStep;

  @override
  State<LivenessSheet> createState() => _LivenessSheetState();
}

class _LivenessSheetState extends State<LivenessSheet> {
  SelfieCameraSession? _session;
  String? _cameraError;
  _Phase _phase = _Phase.ready;
  int _index = 0;
  int _count = 0;
  String? _failure;
  bool _flash = false;

  /// null = the front photo, then the moves.
  late final List<LivenessStep?> _all = [null, ...widget.steps];

  @override
  void initState() {
    super.initState();
    widget.camera.open(shared: widget.shared).then((s) {
      if (!mounted) {
        unawaited(s.close());
        return;
      }
      setState(() => _session = s);
    }, onError: (Object _) {
      if (mounted) setState(() => _cameraError = "Couldn't open the camera. Check Vibe's camera permission.");
    });
  }

  @override
  void dispose() {
    unawaited(_session?.close());
    super.dispose();
  }

  void _fail(String message) => setState(() {
        _phase = _Phase.failed;
        _failure = message;
      });

  Future<void> _run() async {
    final session = _session;
    if (session == null) return;
    final frames = <List<int>>[];
    for (var i = 0; i < _all.length; i++) {
      for (var c = widget.secondsPerStep; c > 0; c--) {
        if (!mounted) return;
        setState(() {
          _phase = _Phase.capturing;
          _index = i;
          _count = c;
        });
        await Future<void>.delayed(const Duration(seconds: 1));
      }
      final frame = await session.grab().catchError((Object _) => null);
      if (!mounted) return;
      if (frame == null) return _fail('The camera stopped. Try again.');
      frames.add(frame);
      setState(() => _flash = true);
      Future<void>.delayed(const Duration(milliseconds: 160), () {
        if (mounted) setState(() => _flash = false);
      });
    }
    setState(() => _phase = _Phase.checking);
    try {
      final v = await widget.check(frames);
      if (mounted) Navigator.of(context).pop(v);
    } on ApiException catch (e) {
      if (mounted) _fail(e.message);
    } catch (_) {
      if (mounted) _fail("Couldn't send the photos. Check your connection and try again.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final capturing = _phase == _Phase.capturing;
    final done = capturing ? _index : (_phase == _Phase.checking ? _all.length : 0);
    final step = capturing ? _stepText(_all[_index]) : null;
    final moves = widget.steps.map((s) => _stepText(s).title.toLowerCase()).join(', then ');
    final (title, subtitle, icon) = switch (_phase) {
      _Phase.capturing => (step!.title, 'Hold it — the photo is taken automatically.', step.icon),
      _Phase.checking => ('Checking…', 'Comparing with your profile photo.', Icons.verified_user_rounded),
      _Phase.failed => ("That didn't work", _failure ?? 'Try again.', Icons.photo_camera_front_rounded),
      _Phase.ready => ('${_all.length} quick poses', 'Look straight at the camera, then $moves.', Icons.photo_camera_front_rounded),
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              for (var i = 0; i < _all.length; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                Expanded(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    height: 4,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(2),
                      color: i < done ? V.trust : (i == done && capturing ? V.trust.withValues(alpha: 0.45) : Colors.white.withValues(alpha: 0.12)),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          Semantics(
            liveRegion: true,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: 48),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(shape: BoxShape.circle, color: V.trust.withValues(alpha: 0.14)),
                    child: Icon(icon, size: 22, color: V.trust),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(title, style: VT.title(17)),
                        const SizedBox(height: 2),
                        Text(subtitle, style: VT.body(13, color: V.text2)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          AspectRatio(aspectRatio: 3 / 4, child: _preview(capturing)),
          const SizedBox(height: 16),
          if (_phase == _Phase.ready || _phase == _Phase.failed) ...[
            GradientButton(
              label: _phase == _Phase.failed ? 'Try again' : 'Start',
              icon: Icons.photo_camera_front_rounded,
              gradient: V.gemGrad,
              foreground: V.onGem,
              glow: V.gem,
              onTap: _session == null ? null : _run,
            ),
            const SizedBox(height: 10),
          ],
          if (_phase != _Phase.checking) GhostButton(label: 'Cancel', expand: true, onTap: () => Navigator.of(context).pop()),
        ],
      ),
    );
  }

  Widget _preview(bool capturing) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.line)),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_session != null) _session!.preview(),
          if (_session == null && _cameraError == null) const Center(child: CircularProgressIndicator(color: V.trust)),
          if (_cameraError != null)
            Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_cameraError!, textAlign: TextAlign.center, style: VT.body(14, color: V.text2)))),
          IgnorePointer(
            child: FractionallySizedBox(
              widthFactor: 0.76,
              heightFactor: 0.76,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 300),
                decoration: ShapeDecoration(
                  shape: OvalBorder(side: BorderSide(width: 2, color: capturing || _phase == _Phase.checking ? V.trust.withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.3))),
                ),
              ),
            ),
          ),
          if (capturing)
            Positioned(
              left: 0,
              right: 0,
              bottom: 20,
              child: Center(
                child: Container(
                  key: ValueKey('count-$_index-$_count'),
                  width: 56,
                  height: 56,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withValues(alpha: 0.45)),
                  child: Text('$_count', style: VT.number(26, color: Colors.white)),
                ),
              ),
            ),
          if (_phase == _Phase.checking)
            Container(color: Colors.black.withValues(alpha: 0.35), alignment: Alignment.center, child: const CircularProgressIndicator(color: V.trust)),
          IgnorePointer(child: AnimatedOpacity(opacity: _flash ? 0.6 : 0, duration: const Duration(milliseconds: 150), child: const ColoredBox(color: Colors.white))),
        ],
      ),
    );
  }
}
