import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/intent_icons.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../models/payments.dart';
import '../../providers/follows_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../onboarding/profile_setup_screen.dart';
import 'me_sections.dart';
import 'verification_flow.dart';

// The top of Me, the same as the web (web/src/features/profile/me-overview.tsx):
// the card others see, what's left to fill in, where verification stands and
// your numbers.

void _openEdit(BuildContext context) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileSetupScreen(editing: true)));

/// Camera or gallery → uploaded right away. Without a picker (desktop,
/// tests, the offline demo) a stock portrait stands in.
Future<void> changeProfilePhoto(BuildContext context, void Function(bool) setUploading) async {
  final session = context.read<SessionProvider>();
  final me = session.me;
  if (me == null) return;
  final media = context.read<AppServices>().media;
  if (!media.available) {
    final n = (me.name.hashCode.abs() % 70) + 1;
    await session.saveProfile(me.copyWith(avatarUrl: 'https://i.pravatar.cc/400?img=$n'));
    return;
  }
  final camera = await showVibeSheet<bool>(
    context,
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(leading: const Icon(SolarIconsBold.camera, color: V.text), title: Text('Take a photo', style: VT.body(15)), onTap: () => Navigator.of(context).pop(true)),
        ListTile(leading: const Icon(SolarIconsBold.galleryWide, color: V.text), title: Text('Choose from gallery', style: VT.body(15)), onTap: () => Navigator.of(context).pop(false)),
        const SizedBox(height: 8),
      ],
    ),
  );
  if (camera == null || !context.mounted) return;
  try {
    final photo = await media.pickPhoto(camera: camera);
    if (photo == null || !context.mounted) return;
    setUploading(true);
    await session.uploadAvatar(photo.bytes, contentType: photo.contentType);
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  } on FormatException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  } catch (_) {
    if (context.mounted) toast(context, "Couldn't open the camera or gallery. Check Vibe's permissions.", error: true);
  } finally {
    setUploading(false);
  }
}

// ── Profile card ──────────────────────────────────────────────────────────

/// "How others see you". With a photo, the photo is the card. Without one,
/// the card asks for a real photo instead of showing a big initial; missing
/// bio and "here for" show as gaps to fill, not as nothing.
class ProfileCard extends StatefulWidget {
  const ProfileCard({super.key, required this.me, required this.vip});
  final Profile me;
  final bool vip;

  @override
  State<ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<ProfileCard> {
  bool _uploading = false;

  void _addPhoto() {
    if (_uploading) return;
    unawaited(changeProfilePhoto(context, (v) {
      if (mounted) setState(() => _uploading = v);
    }));
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final hasPhoto = me.avatarUrl.isNotEmpty;

    final top = Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const GlassPill(label: 'How others see you', icon: SolarIconsBold.eye, height: 28, fontSize: 11.5),
          const Spacer(),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (widget.vip) const GlassPill(label: 'VIP', icon: SolarIconsBold.crown, tint: V.gold, textColor: V.gold, height: 28, fontSize: 11.5),
              if (widget.vip && me.verified) const SizedBox(height: 6),
              if (me.verified) const GlassPill(label: 'Verified', icon: SolarIconsBold.verifiedCheck, tint: V.trust, textColor: V.trust, height: 28, fontSize: 11.5),
            ],
          ),
        ],
      ),
    );

    final addPhoto = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Semantics(
            button: true,
            label: 'Add a profile photo',
            child: GestureDetector(
              onTap: _addPhoto,
              child: CustomPaint(
                painter: _DashedCircle(color: Colors.white.withValues(alpha: 0.3)),
                child: Container(
                  width: 104,
                  height: 104,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.06)),
                  child: _uploading
                      ? const Center(child: SizedBox.square(dimension: 28, child: CircularProgressIndicator(strokeWidth: 3, color: V.pink)))
                      : Icon(Icons.add_a_photo_rounded, size: 36, color: Colors.white.withValues(alpha: 0.85)),
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text('Add a photo of you', style: VT.title(17, weight: FontWeight.w600)),
          const SizedBox(height: 4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 300),
            child: Text(
              'A clear face photo gets you more matches. You also need one to get verified.',
              textAlign: TextAlign.center,
              style: VT.body(13, color: Colors.white.withValues(alpha: 0.7), height: 1.45),
            ),
          ),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: _addPhoto,
            child: Container(
              height: 40,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(SolarIconsBold.camera, size: 18, color: V.bg),
                  const SizedBox(width: 6),
                  Text(_uploading ? 'Uploading…' : 'Add photo', style: VT.label(14, color: V.bg, weight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ],
      ),
    );

    Widget chip(String text) => Glass(
      radius: 13,
      height: 26,
      blur: 16,
      color: Colors.white.withValues(alpha: 0.12),
      border: Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Center(widthFactor: 1, child: Text(text, style: VT.label(12, color: V.text))),
    );

    final details = Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Flexible(child: Text('${me.name}, ${me.age}', overflow: TextOverflow.ellipsis, style: VT.display(28, height: 1.1))),
              if (me.verified) const Padding(padding: EdgeInsets.only(left: 6), child: Icon(SolarIconsBold.verifiedCheck, color: V.trust, size: 22, semanticLabel: 'Verified')),
            ],
          ),
          const SizedBox(height: 2),
          Text('${me.country.flag} ${me.country.name} · ${me.gender.label}', style: VT.body(13, color: Colors.white.withValues(alpha: 0.78))),
          if (me.bio.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(me.bio, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.body(13.5, color: Colors.white.withValues(alpha: 0.9))),
          ] else ...[
            const SizedBox(height: 8),
            _FillGap(icon: Icons.edit_note_rounded, label: 'Add a line about you', onTap: () => _openEdit(context)),
          ],
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (me.intent != null)
                Glass(
                  radius: 13,
                  height: 26,
                  blur: 16,
                  color: V.pink.withValues(alpha: 0.18),
                  border: V.pink.withValues(alpha: 0.4),
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(intentIcon(me.intent!), size: 14, color: V.pinkSoft),
                      const SizedBox(width: 4),
                      Text('Here for: ${me.intent!.label}', style: VT.label(12, color: V.text)),
                    ],
                  ),
                )
              else
                _FillGap(icon: Icons.add_rounded, label: 'What are you here for?', chip: true, onTap: () => _openEdit(context)),
              for (final i in me.interests.take(3)) chip(i),
            ],
          ),
        ],
      ),
    );

    return Container(
      clipBehavior: Clip.antiAlias,
      constraints: BoxConstraints(minHeight: hasPhoto ? 360 : 400),
      height: hasPhoto ? 360 : null,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: V.line),
        gradient: const LinearGradient(colors: [Color(0xFF2B1B4D), V.surface], begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
      child: hasPhoto
          ? Stack(
              fit: StackFit.expand,
              children: [
                Image.network(me.avatarUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 240,
                  child: DecoratedBox(
                    decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, colors: [V.bg.withValues(alpha: 0.94), V.bg.withValues(alpha: 0)])),
                  ),
                ),
                Column(children: [top, const Spacer(), details]),
              ],
            )
          : Column(children: [top, addPhoto, details]),
    );
  }
}

/// A missing part of the profile, shown where it would be, as a dashed link to fill it in.
class _FillGap extends StatelessWidget {
  const _FillGap({required this.icon, required this.label, required this.onTap, this.chip = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool chip;

  @override
  Widget build(BuildContext context) {
    final radius = chip ? 13.0 : 10.0;
    return GestureDetector(
      onTap: onTap,
      child: CustomPaint(
        painter: _DashedRRect(color: Colors.white.withValues(alpha: 0.3), radius: radius),
        child: Container(
          height: chip ? 26 : 32,
          padding: EdgeInsets.symmetric(horizontal: chip ? 10 : 12),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: chip ? 14 : 16, color: V.pinkSoft),
              const SizedBox(width: 4),
              Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(chip ? 12 : 12.5, color: Colors.white.withValues(alpha: 0.8)))),
            ],
          ),
        ),
      ),
    );
  }
}

/// CSS `border: 1px dashed` on a rounded box (dashes 3, gaps 3).
class _DashedRRect extends CustomPainter {
  const _DashedRRect({required this.color, required this.radius});
  final Color color;
  final double radius;
  static const width = 1.0;

  @override
  void paint(Canvas canvas, Size size) {
    final rrect = RRect.fromRectAndRadius((Offset.zero & size).deflate(width / 2), Radius.circular(radius));
    _dash(canvas, Path()..addRRect(rrect), color, width);
  }

  @override
  bool shouldRepaint(_DashedRRect old) => old.color != color || old.radius != radius;
}

class _DashedCircle extends CustomPainter {
  const _DashedCircle({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) => _dash(canvas, Path()..addOval((Offset.zero & size).deflate(1)), color, 2, dash: 6);

  @override
  bool shouldRepaint(_DashedCircle old) => old.color != color;
}

void _dash(Canvas canvas, Path path, Color color, double width, {double? dash}) {
  final d = dash ?? width * 3;
  final paint = Paint()
    ..color = color
    ..style = PaintingStyle.stroke
    ..strokeWidth = width;
  for (final m in path.computeMetrics()) {
    for (var t = 0.0; t < m.length; t += d * 2) {
      canvas.drawPath(m.extractPath(t, t + d), paint);
    }
  }
}

// ── Profile progress ──────────────────────────────────────────────────────

/// One of the four parts of a full profile, in the order worth doing them.
class ProfileStep {
  const ProfileStep(this.id, this.label, this.done, this.action);
  final String id;
  final String label;
  final bool done;

  /// The button when this is the next thing to do.
  final String action;
}

List<ProfileStep> profileSteps(Profile me) {
  final picked = me.interests.length.clamp(0, 3);
  return [
    ProfileStep('photo', 'Photo', me.avatarUrl.isNotEmpty, 'Add a photo'),
    ProfileStep('bio', 'Bio', me.bio.trim().isNotEmpty, 'Write a line about you'),
    ProfileStep(
      'interests',
      'Interests $picked/3',
      me.interests.length >= 3,
      me.interests.isEmpty ? 'Pick 3 interests' : (3 - picked == 1 ? 'Pick 1 more interest' : 'Pick ${3 - picked} more interests'),
    ),
    ProfileStep('intent', 'Here for', me.intent != null, "Say what you're here for"),
  ];
}

/// How far along you are, what's left, one button for the next step, and
/// the coin bonus when it's waiting. Hidden once everything's done and the
/// bonus is claimed.
class ProfileProgress extends StatefulWidget {
  const ProfileProgress({super.key, required this.me});
  final Profile me;

  /// False once everything's done and the bonus is claimed (the card is then left out).
  static bool shows(Profile me, {required bool bonusClaimed}) => profileSteps(me).any((s) => !s.done) || (!bonusClaimed && me.isComplete);

  @override
  State<ProfileProgress> createState() => _ProfileProgressState();
}

class _ProfileProgressState extends State<ProfileProgress> {
  bool _claiming = false;

  Future<void> _claim() async {
    setState(() => _claiming = true);
    try {
      final r = await context.read<WalletProvider>().claimProfileBonus();
      if (mounted) toast(context, r == null ? 'Already claimed' : '+$r coins', error: r == null);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final bonusClaimed = context.select<WalletProvider, bool>((w) => w.wallet.profileBonusClaimed);
    final bonus = Economy.profileCompleteCoins;
    final steps = profileSteps(me);
    final done = steps.where((s) => s.done).length;
    final next = steps.where((s) => !s.done).firstOrNull;
    // A missing photo has its own prompt on the card above, so the button here moves on to the next gap.
    final action = steps.where((s) => !s.done && s.id != 'photo').firstOrNull;
    final bonusReady = !bonusClaimed && me.isComplete;
    if (next == null && !bonusReady) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Expanded(child: Text(next != null ? 'Finish your profile' : 'Profile complete', style: VT.title(15, weight: FontWeight.w600))),
              Text('$done of ${steps.length}', style: VT.number(13, color: V.text2)),
            ],
          ),
          const SizedBox(height: 10),
          Semantics(
            label: 'Profile progress, $done of ${steps.length}',
            child: Row(
              children: [
                for (var i = 0; i < steps.length; i++) ...[
                  if (i > 0) const SizedBox(width: 4),
                  Expanded(
                    child: Container(height: 6, decoration: BoxDecoration(color: steps[i].done ? V.pink : V.surface3, borderRadius: BorderRadius.circular(3))),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final s in steps)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(s.done ? SolarIconsBold.checkCircle : Icons.radio_button_unchecked_rounded, size: 15, color: s.done ? V.ok : V.muted),
                    const SizedBox(width: 4),
                    Text(s.label, style: VT.label(12.5, color: s.done ? V.text2 : V.muted)),
                  ],
                ),
            ],
          ),
          if (!bonusClaimed) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(SolarIconsBold.dollar, size: 15, color: V.gold),
                const SizedBox(width: 6),
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      style: VT.body(12.5, color: V.text2),
                      children: bonusReady
                          ? [const TextSpan(text: 'Your '), TextSpan(text: '+$bonus coins', style: const TextStyle(color: V.gold)), const TextSpan(text: ' bonus is ready.')]
                          : [const TextSpan(text: 'Photo, bio and 3 interests earn '), TextSpan(text: '+$bonus coins', style: const TextStyle(color: V.gold)), const TextSpan(text: '.')],
                    ),
                  ),
                ),
              ],
            ),
          ],
          if (bonusReady) ...[
            const SizedBox(height: 14),
            GradientButton(label: 'Claim +$bonus coins', gradient: V.goldGrad, foreground: V.onGold, glow: V.gold, height: 46, busy: _claiming, onTap: _claim),
          ] else if (action != null) ...[
            const SizedBox(height: 14),
            GradientButton(label: action.action, height: 46, onTap: () => _openEdit(context)),
          ],
        ],
      ),
    );
  }
}

// ── Verification ──────────────────────────────────────────────────────────

/// Where you stand on the selfie check, always in view on Me, with the one
/// thing to do next: verify, add a photo first, retry, or nothing (verified).
class VerificationCard extends StatefulWidget {
  const VerificationCard({super.key, required this.me});
  final Profile me;

  @override
  State<VerificationCard> createState() => _VerificationCardState();
}

class _VerificationCardState extends State<VerificationCard> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(context.read<SessionProvider>().loadVerification());
  }

  Future<void> _verify() async {
    setState(() => _busy = true);
    try {
      await startSelfieVerification(context);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final v = context.select<SessionProvider, VerificationState>((s) => s.verification);
    if (me.verified) {
      return GestureDetector(
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SafetySectionScreen())),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: V.trust.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(V.r),
            border: Border.all(color: V.trust.withValues(alpha: 0.3)),
          ),
          child: Row(
            children: [
              const Icon(SolarIconsBold.verifiedCheck, size: 22, color: V.trust),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("You're verified", style: VT.title(14, weight: FontWeight.w600, color: V.trust)),
                    Text('Your badge shows on calls, and people matching "verified only" can meet you.', style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
              const Icon(SolarIconsOutline.altArrowRight, color: V.muted),
            ],
          ),
        ),
      );
    }

    final hasPhoto = me.avatarUrl.isNotEmpty;
    final pending = v.status == VerificationStatus.pending;
    final rejected = v.status == VerificationStatus.rejected;
    final title = pending
        ? 'Your selfie is in review'
        : rejected
        ? "Verification didn't go through"
        : hasPhoto
        ? 'Get verified'
        : 'Verification needs a photo';
    final reason = (v.reason ?? "We couldn't match your selfie to your photo.").replaceFirst(RegExp(r'\.?$'), '.');
    final body = pending
        ? "A person is checking it against your profile photo. We'll let you know."
        : rejected
        ? '$reason Try again in good light.'
        : hasPhoto
        ? 'A quick selfie check, compared with your photo. You get a badge, and people who only meet verified profiles can match with you.'
        : 'We compare a quick selfie with your profile photo. Add a photo of your face above, then verify here.';
    final quiet = pending || !hasPhoto;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: quiet ? V.surface : V.trust.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(V.r),
        border: Border.all(color: quiet ? V.line : V.trust.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: V.trust.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
                child: Icon(
                  pending
                      ? SolarIconsBold.hourglass
                      : rejected
                      ? Icons.gpp_maybe_rounded
                      : SolarIconsBold.shieldCheck,
                  size: 22,
                  color: V.trust,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      runSpacing: 4,
                      children: [
                        Text(title, style: VT.title(15, weight: FontWeight.w600)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: pending ? V.warn.withValues(alpha: 0.14) : Colors.white.withValues(alpha: 0.08),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(pending ? 'In review' : 'Not verified', style: VT.label(10.5, color: pending ? V.warn : V.text2, weight: FontWeight.w700)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(body, style: VT.body(12.5, color: V.text2, height: 1.45)),
                  ],
                ),
              ),
            ],
          ),
          if (!quiet) ...[
            const SizedBox(height: 14),
            GradientButton(
              label: rejected ? 'Try again' : 'Verify now',
              icon: SolarIconsBold.cameraMinimalistic,
              gradient: V.gemGrad,
              foreground: V.onGem,
              glow: V.gem,
              height: 46,
              busy: _busy,
              onTap: _verify,
            ),
          ],
        ],
      ),
    );
  }
}

// ── Your numbers ──────────────────────────────────────────────────────────

/// Your numbers, each with what it counts. Average call and skip rate come
/// from your recent calls, and the card says how many.
class StatsCard extends StatelessWidget {
  const StatsCard({super.key, required this.me});
  final Profile me;

  @override
  Widget build(BuildContext context) {
    final friends = context.select<SocialProvider, int>((s) => s.friends.length);
    final match = context.watch<MatchProvider>();
    final hideStats = context.select<FollowsProvider, bool>((f) => f.settings.hideStats);
    final history = match.history;
    final ended = history.where((r) => r.endedAt != null).length;

    Widget big(String value, String label, String caption) => Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Column(
          children: [
            Text(value, style: VT.number(20)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: VT.label(12, color: V.text)),
            const SizedBox(height: 2),
            Text(caption, textAlign: TextAlign.center, style: VT.body(11, color: V.muted, height: 1.3)),
          ],
        ),
      ),
    );
    Widget small(String value, String label, String caption) => Expanded(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Column(
          children: [
            Text(value, style: VT.number(15, weight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(label, textAlign: TextAlign.center, style: VT.label(11.5, color: V.text2)),
            const SizedBox(height: 2),
            Text(caption, textAlign: TextAlign.center, style: VT.body(10.5, color: V.muted, height: 1.3)),
          ],
        ),
      ),
    );

    return Container(
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(
              children: [
                Text('YOUR NUMBERS', style: VT.overline()),
                const SizedBox(width: 8),
                Expanded(
                  child: GestureDetector(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const FollowersSectionScreen())),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Icon(hideStats ? SolarIconsBold.eyeClosed : SolarIconsBold.eye, size: 13, color: V.muted),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            hideStats ? 'Only you see these' : 'Matches & likes are on your profile',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: VT.body(11.5, color: V.muted),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  big(Fmt.thousands(me.matches), 'Matches', "Video calls you've had"),
                  const VerticalDivider(width: 1, color: V.lineSoft),
                  big(Fmt.thousands(me.likes), 'Likes', 'People who liked you on a call'),
                  const VerticalDivider(width: 1, color: V.lineSoft),
                  big(Fmt.thousands(friends), 'Friends', "Friends you've made on Vibe"),
                ],
              ),
            ),
          ),
          const Divider(height: 1, color: V.lineSoft),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                small('${match.matchesToday}', 'Today', 'Calls since midnight'),
                small(ended > 0 ? Fmt.duration(match.averageLength) : '–', 'Avg call', 'How long calls last'),
                small(history.isNotEmpty ? '${(match.skipRate * 100).round()}%' : '–', 'Skip rate', 'Ended within 10 s'),
              ],
            ),
          ),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: V.lineSoft))),
            child: Text(
              history.isNotEmpty
                  ? 'Today, avg call and skip rate use your last ${history.length} ${history.length == 1 ? 'call' : 'calls'}.'
                  : 'Today, avg call and skip rate fill in after your first call.',
              textAlign: TextAlign.center,
              style: VT.body(11, color: V.muted),
            ),
          ),
        ],
      ),
    );
  }
}
