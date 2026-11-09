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
import '../../providers/engagement_provider.dart';
import '../../providers/match_provider.dart';
import '../../providers/session_provider.dart';
import '../../providers/social_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../invite/invite_share.dart';
import '../onboarding/profile_setup_screen.dart';
import 'me_sections.dart';
import 'user_profile_screen.dart';
import 'verification_flow.dart';

// The top of Me, the same as the web (web/src/features/profile/me-overview.tsx):
// your photo and three numbers, name and bio, Edit / Share / Preview, what's
// left to fill in and your last matches. The full card others see opens from
// the eye button.

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

// ── Profile header ────────────────────────────────────────────────────────

/// The top of Me, laid out like the profile pages people already know:
/// photo with the brand ring, your three numbers beside it, then name, a
/// line about where you're from and your bio, and Edit / Share / Preview.
class ProfileHeader extends StatefulWidget {
  const ProfileHeader({super.key, required this.me});
  final Profile me;

  @override
  State<ProfileHeader> createState() => _ProfileHeaderState();
}

class _ProfileHeaderState extends State<ProfileHeader> {
  bool _uploading = false;

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final friends = context.select<SocialProvider, int>((s) => s.friends.length);
    final level = context.select<EngagementProvider, int>((e) => e.level.level);
    final vip = context.select<WalletProvider, bool>((w) => w.isVip);
    final hasPhoto = me.avatarUrl.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Semantics(
              button: true,
              label: hasPhoto ? 'See how others see you' : 'Add a profile photo',
              child: GestureDetector(
                onTap: hasPhoto ? () => previewProfile(context, me, vip: vip) : (_uploading ? null : () => changeProfilePhoto(context, (b) => mounted ? setState(() => _uploading = b) : null)),
                child: SizedBox(
                  width: 92,
                  height: 92,
                  child: Stack(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(3),
                        decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand),
                        child: Container(
                          decoration: BoxDecoration(shape: BoxShape.circle, color: V.surface2, border: Border.all(color: V.bg, width: 3)),
                          clipBehavior: Clip.antiAlias,
                          child: hasPhoto
                              ? Image.network(me.avatarUrl, fit: BoxFit.cover, width: 92, height: 92, errorBuilder: (_, _, _) => const SizedBox.shrink())
                              : Center(
                                  child: _uploading
                                      ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 3, color: V.pinkSoft))
                                      : const Icon(SolarIconsBold.cameraAdd, size: 30, color: V.text2),
                                ),
                        ),
                      ),
                      if (me.verified)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(shape: BoxShape.circle, color: V.trust, border: Border.all(color: V.bg, width: 3)),
                            child: const Icon(Icons.check_rounded, size: 16, color: V.onGem, semanticLabel: 'Verified'),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: 18),
            Expanded(
              child: Row(
                children: [
                  _Stat(value: me.matches, label: 'Matches', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RecentMatchesScreen()))),
                  _Stat(value: me.likes, label: 'Likes'),
                  _Stat(value: friends, label: 'Friends'),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 8,
          runSpacing: 4,
          children: [
            Text('${me.name}, ${me.age}', style: VT.title(17)),
            if (vip) const _Chip(label: 'VIP', color: V.gold, icon: SolarIconsBold.crown),
            me.verified ? const _Chip(label: 'Verified', color: V.trust, icon: SolarIconsBold.verifiedCheck) : const _Chip(label: 'Not verified'),
          ],
        ),
        const SizedBox(height: 4),
        Text('${me.country.flag} ${me.country.name} · ${me.gender.label} · Level $level', style: VT.body(13, color: V.text2)),
        if (me.bio.trim().isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(me.bio, maxLines: 3, overflow: TextOverflow.ellipsis, style: VT.body(14)),
        ],
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(child: GhostButton(label: 'Edit profile', height: 40, expand: true, onTap: () => _openEdit(context))),
            const SizedBox(width: 8),
            Expanded(child: GhostButton(label: 'Share profile', height: 40, expand: true, onTap: () => _share(context, me))),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: 'See how others see you',
              child: Material(
                color: Colors.white.withValues(alpha: 0.06),
                shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.10))),
                child: InkWell(
                  customBorder: const StadiumBorder(),
                  onTap: () => previewProfile(context, me, vip: vip),
                  child: const SizedBox(width: 40, height: 40, child: Icon(SolarIconsBold.eye, size: 19, color: V.text)),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _share(BuildContext context, Profile me) async {
    final share = context.read<AppServices>().share;
    final link = inviteLinkFor(context, channel: 'profile');
    final text = "I'm on Vibe, free video chat with real people. Come say hi${me.name.isNotEmpty ? ' to ${me.name}' : ''}: $link";
    if (await share.shareText(text)) return;
    if (context.mounted) await copyInvite(context, text: text);
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label, this.onTap});
  final int value;
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Expanded(
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Column(
              children: [
                Text(Fmt.thousands(value), style: VT.number(20)),
                const SizedBox(height: 2),
                Text(label, style: VT.label(12, color: V.text2)),
              ],
            ),
          ),
        ),
      );
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.color, this.icon});
  final String label;
  final Color? color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        height: 22,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(color: color?.withValues(alpha: 0.14) ?? Colors.white.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(11)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[Icon(icon, size: 13, color: color ?? V.text2), const SizedBox(width: 4)],
            Text(label, style: VT.label(11, color: color ?? V.text2)),
          ],
        ),
      );
}

/// "How others see you": the full profile card in a sheet.
Future<void> previewProfile(BuildContext context, Profile me, {required bool vip}) => showVibeSheet<void>(
      context,
      child: Padding(padding: const EdgeInsets.fromLTRB(16, 4, 16, 16), child: ProfileCard(me: me, vip: vip)),
    );

// ── Complete your profile ─────────────────────────────────────────────────

class _Todo {
  const _Todo(this.id, this.icon, this.color, this.title, this.body, this.action, {this.onTap, this.busy = false, this.gold = false});
  final String id;
  final IconData icon;
  final Color color;
  final String title;
  final String body;

  /// The button ('' = no button, e.g. in review).
  final String action;
  final VoidCallback? onTap;
  final bool busy;
  final bool gold;
}

/// What's left, as small cards you swipe through (photo, bio, interests,
/// here for, verification, then the coin bonus). Gone once everything's done.
class CompleteProfile extends StatefulWidget {
  const CompleteProfile({super.key, required this.me});
  final Profile me;

  @override
  State<CompleteProfile> createState() => _CompleteProfileState();
}

class _CompleteProfileState extends State<CompleteProfile> {
  bool _claiming = false;
  bool _uploading = false;
  bool _verifying = false;

  @override
  void initState() {
    super.initState();
    unawaited(context.read<SessionProvider>().loadVerification());
  }

  Future<void> _claim() async {
    setState(() => _claiming = true);
    try {
      final r = await context.read<WalletProvider>().claimProfileBonus();
      if (mounted) toast(context, r == null ? 'Already claimed' : '+$r coins', error: r == null);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  Future<void> _verify() async {
    setState(() => _verifying = true);
    try {
      await startSelfieVerification(context);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = widget.me;
    final v = context.select<SessionProvider, VerificationState>((s) => s.verification);
    final bonusClaimed = context.select<WalletProvider, bool>((w) => w.wallet.profileBonusClaimed);
    final bonus = Economy.profileCompleteCoins;
    final steps = profileSteps(me);
    final bonusLine = bonusClaimed ? '' : ' · part of +$bonus coins';
    final todos = <_Todo>[
      if (!bonusClaimed && me.isComplete) _Todo('bonus', SolarIconsBold.dollar, V.gold, '+$bonus coins', 'Your profile bonus is ready', 'Claim', onTap: _claim, busy: _claiming, gold: true),
      for (final s in steps.where((s) => !s.done))
        switch (s.id) {
          'photo' => _Todo('photo', SolarIconsBold.cameraAdd, V.pink, 'Add a photo', 'A clear face photo gets more matches', 'Add',
              busy: _uploading, onTap: () => changeProfilePhoto(context, (b) => mounted ? setState(() => _uploading = b) : null)),
          'bio' => _Todo('bio', SolarIconsBold.penNewSquare, V.lavender, 'Write a bio', 'One line about you$bonusLine', 'Write', onTap: () => _openEdit(context)),
          'interests' => _Todo('interests', SolarIconsBold.widget, V.pink, 'Add interests', '${s.action}$bonusLine', 'Add', onTap: () => _openEdit(context)),
          _ => _Todo('intent', SolarIconsBold.handHeart, V.lavender, "Why you're here", 'Friends, dating or just chat', 'Add', onTap: () => _openEdit(context)),
        },
      if (!me.verified)
        v.status == VerificationStatus.pending
            ? const _Todo('verify', SolarIconsBold.hourglass, V.trust, 'Selfie in review', 'A person is checking it now', '')
            : _Todo('verify', SolarIconsBold.shieldCheck, V.trust, v.status == VerificationStatus.rejected ? 'Try verifying again' : 'Get verified',
                me.avatarUrl.isNotEmpty ? 'Quick selfie, get the badge' : 'Add a photo first', 'Verify',
                busy: _verifying, onTap: me.avatarUrl.isNotEmpty ? _verify : null),
    ];
    if (todos.isEmpty) return const SizedBox.shrink();
    final total = steps.length + 1;
    final done = steps.where((s) => s.done).length + (me.verified || v.status == VerificationStatus.pending ? 1 : 0);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle('Complete your profile · $done of $total', top: 26, bottom: 10),
        SizedBox(
          height: 196,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: todos.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _TodoCard(t: todos[i]),
          ),
        ),
      ],
    );
  }
}

class _TodoCard extends StatelessWidget {
  const _TodoCard({required this.t});
  final _Todo t;

  @override
  Widget build(BuildContext context) => Container(
        width: 152,
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 12),
        decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: V.line)),
        child: Column(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(shape: BoxShape.circle, color: t.color.withValues(alpha: 0.14)),
              child: Icon(t.icon, size: 24, color: t.color),
            ),
            const SizedBox(height: 10),
            Text(t.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.title(14)),
            const SizedBox(height: 2),
            Expanded(child: Text(t.body, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.body(12, color: V.text2, height: 1.35))),
            if (t.action.isEmpty)
              SizedBox(height: 34, child: Center(child: Text('In review', style: VT.label(12.5, color: V.warn))))
            else
              Opacity(
                opacity: t.onTap == null ? 0.45 : 1,
                child: GradientButton(
                  label: t.action,
                  height: 34,
                  gradient: t.gold ? V.goldGrad : V.brand,
                  foreground: t.gold ? V.onGold : Colors.white,
                  busy: t.busy,
                  onTap: t.onTap,
                ),
              ),
          ],
        ),
      );
}

// ── Recent matches ────────────────────────────────────────────────────────

/// The people from your last calls, like a row of stories; tap one for their profile.
class RecentMatches extends StatelessWidget {
  const RecentMatches({super.key});

  @override
  Widget build(BuildContext context) {
    final history = context.select<MatchProvider, List<MatchRecord>>((m) => m.history);
    final seen = <String>{};
    final people = [for (final r in history) if (seen.add(r.partner.id)) r.partner].take(8).toList();
    if (people.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionTitle('Recent matches', action: 'See all', onAction: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const RecentMatchesScreen())), top: 26, bottom: 10),
        SizedBox(
          height: 82,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: people.length,
            separatorBuilder: (_, _) => const SizedBox(width: 14),
            itemBuilder: (_, i) {
              final p = people[i];
              return GestureDetector(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: p.id))),
                child: SizedBox(
                  width: 64,
                  child: Column(
                    children: [
                      VAvatar(url: p.avatarUrl, name: p.name, size: 58),
                      const SizedBox(height: 6),
                      Text(p.name.split(' ').first, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(12, color: V.text2)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
