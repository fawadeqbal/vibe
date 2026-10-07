import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../invite/invite_banner.dart';

/// First screen ever. Real faces, one promise, the three safety promises
/// right under it, one button. Slides advance story-style.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key, required this.onContinue});
  final VoidCallback onContinue;

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _Slide {
  const _Slide(this.title, this.accent, this.body, this.left, this.right, this.badge);
  final String title;
  final String accent;
  final String body;
  final _Face left;
  final _Face right;
  final IconData? badge;
}

class _Face {
  const _Face(this.url, this.caption, {this.chip, this.chipIcon, this.chipColor});
  final String url;
  final String caption;
  final String? chip;
  final IconData? chipIcon;
  final Color? chipColor;
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final _page = PageController();
  int _index = 0;

  static const _slides = <_Slide>[
    _Slide(
      'Meet someone new, ',
      'right now.',
      'One tap connects you on video with a real person somewhere in the world.',
      _Face('https://i.pravatar.cc/400?img=15', '🇮🇳 Priya, 25'),
      _Face('https://i.pravatar.cc/400?img=20', '🇺🇸 Sofia, 24', chip: 'Verified', chipIcon: SolarIconsBold.verifiedCheck, chipColor: V.gem),
      null,
    ),
    _Slide(
      'Not your vibe? ',
      'Next.',
      'One tap and you are talking to someone else. There is always someone online.',
      _Face('https://i.pravatar.cc/400?img=33', '🇹🇷 Mert, 26'),
      _Face('https://i.pravatar.cc/400?img=23', '🇧🇷 Julia, 22', chip: 'You both like Music', chipIcon: SolarIconsBold.widget_4, chipColor: V.lavender),
      SolarIconsBold.skipNext,
    ),
    _Slide(
      'Get paid to be ',
      'you.',
      'People send gifts to the ones they enjoy talking to. Gifts become gems, gems become cash.',
      _Face('https://i.pravatar.cc/400?img=44', '🇵🇰 Ayesha, 23'),
      _Face('https://i.pravatar.cc/400?img=12', '🇬🇧 Liam, 25', chip: '+25 gems', chipIcon: Icons.diamond_rounded, chipColor: V.gem),
      SolarIconsBold.gift,
    ),
  ];

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final slide = _slides[_index];
    return Scaffold(
      backgroundColor: V.bg,
      body: Stack(
        children: [
          // Soft violet glow behind the faces.
          const Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 560,
            child: DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(center: Alignment(0, -0.55), radius: 0.85, colors: [Color(0x388B5CF6), Color(0x000B0A10)]))),
          ),
          SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 14, 24, 0),
                  child: Row(
                    children: [
                      const VibeLogo(size: 28, shadow: false),
                      const SizedBox(width: 10),
                      Expanded(child: Text('Vibe', style: VT.title(19))),
                      Container(
                        height: 26,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(borderRadius: BorderRadius.circular(13), border: Border.all(color: Colors.white.withValues(alpha: 0.18))),
                        child: Text('18+ only', style: VT.label(11, letterSpacing: 0.4)),
                      ),
                    ],
                  ),
                ),
                // Story-style progress.
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 18, 24, 0),
                  child: Row(
                    children: [
                      for (var i = 0; i < _slides.length; i++) ...[
                        if (i > 0) const SizedBox(width: 6),
                        Expanded(
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () => _page.animateToPage(i, duration: const Duration(milliseconds: 300), curve: Curves.easeOut),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 250),
                                height: 3,
                                decoration: BoxDecoration(color: i <= _index ? V.text : Colors.white.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(2)),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _page,
                    itemCount: _slides.length,
                    onPageChanged: (i) => setState(() => _index = i),
                    itemBuilder: (context, i) => Center(child: _HeroCards(slide: _slides[i])),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // "Ali invited you · finish setup to earn 50 coins".
                      const InviteWelcomeBanner(),
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: Column(
                          key: ValueKey(_index),
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(width: double.infinity, child: Headline(slide.title, accent: slide.accent, size: 38, accentColor: V.pinkSoft)),
                            const SizedBox(height: 14),
                            Text(slide.body, style: VT.body(15, color: V.text2, height: 1.5)),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      const Wrap(
                        spacing: 16,
                        runSpacing: 10,
                        children: [
                          _Promise(SolarIconsBold.shieldCheck, 'Selfie-verified'),
                          _Promise(SolarIconsBold.radialBlur, 'Starts blurred'),
                          _Promise(SolarIconsBold.flag, 'Report in 2 taps'),
                        ],
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
                  child: GradientButton(label: 'Get started', onTap: widget.onContinue, icon: SolarIconsOutline.arrowRight, iconAfter: true),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(36, 0, 36, 12),
                  child: Text("By continuing you confirm you're 18+, agree to the Terms and have read the Privacy Policy.", textAlign: TextAlign.center, style: VT.body(11, color: V.muted, height: 1.45)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Promise extends StatelessWidget {
  const _Promise(this.icon, this.label);
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(icon, size: 16, color: V.trust), const SizedBox(width: 6), Text(label, style: VT.label(12, color: V.text, weight: FontWeight.w500))],
    );
  }
}

/// Two tilted portrait cards with the brand mark (or a slide badge) where
/// they meet.
class _HeroCards extends StatelessWidget {
  const _HeroCards({required this.slide});
  final _Slide slide;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      // Scale the 330×300 composition to whatever room the slide gets.
      final scale = math.min(c.maxHeight / 300, c.maxWidth / 330).clamp(0.4, 1.0);
      return SizedBox(
        width: 330 * scale,
        height: 300 * scale,
        child: FittedBox(
          child: SizedBox(
            width: 330,
            height: 300,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(left: 14, top: 22, child: Transform.rotate(angle: -7 * math.pi / 180, child: _card(slide.left))),
                Positioned(right: 14, top: 30, child: Transform.rotate(angle: 6 * math.pi / 180, child: _card(slide.right))),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 6,
                  child: Center(
                    child: Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: V.bg2,
                        border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 30, offset: const Offset(0, 10))],
                      ),
                      alignment: Alignment.center,
                      child: slide.badge == null
                          ? const VibeMark(size: 30)
                          : ShaderMask(shaderCallback: (r) => V.brand.createShader(r), child: Icon(slide.badge, size: 28, color: Colors.white)),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    });
  }

  Widget _card(_Face f) {
    return Container(
      width: 168,
      height: 236,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 48, offset: const Offset(0, 24))],
        gradient: const LinearGradient(colors: [Color(0xFF2B1B4D), V.surface], begin: Alignment.topCenter, end: Alignment.bottomCenter),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Image.network(f.url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
          if (f.chip != null) Positioned(left: 10, top: 10, child: _chip(f.chip!, icon: f.chipIcon, iconColor: f.chipColor)),
          Positioned(left: 10, bottom: 10, child: _chip(f.caption)),
        ],
      ),
    );
  }

  Widget _chip(String text, {IconData? icon, Color? iconColor}) {
    return Glass(
      radius: 12,
      blur: 16,
      border: Colors.transparent,
      padding: EdgeInsets.fromLTRB(icon == null ? 9 : 6, 5, 9, 5),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 14, color: iconColor), const SizedBox(width: 4)],
          Text(text, style: VT.label(11, color: V.text)),
        ],
      ),
    );
  }
}
