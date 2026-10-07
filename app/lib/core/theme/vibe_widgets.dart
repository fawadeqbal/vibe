import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:solar_icons/solar_icons.dart';

import '../util/format.dart';
import 'vibe_theme.dart';

/// The primary action: a brand-gradient pill with a soft glow. One per
/// screen at most — everything else is a [GhostButton].
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.label,
    this.onTap,
    this.icon,
    this.iconAfter = false,
    this.trailing,
    this.busy = false,
    this.height = 56,
    this.gradient,
    this.expand = true,
    this.foreground = Colors.white,
    this.glow,
  });

  final String label;
  final Color foreground;
  final VoidCallback? onTap;
  final IconData? icon;

  /// Put the icon after the label ("Get started →").
  final bool iconAfter;

  /// Extra widget after the label, e.g. a price pill.
  final Widget? trailing;
  final bool busy;
  final double height;
  final Gradient? gradient;
  final bool expand;

  /// Shadow colour; defaults to pink for the brand gradient.
  final Color? glow;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null && !busy;
    final iconW = icon == null ? null : Icon(icon, size: 20, color: foreground);
    final child = AnimatedOpacity(
      duration: const Duration(milliseconds: 150),
      opacity: enabled || busy ? 1 : 0.45,
      child: Container(
        height: height,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        decoration: BoxDecoration(
          gradient: gradient ?? V.brand,
          borderRadius: BorderRadius.circular(height / 2),
          boxShadow: enabled ? [BoxShadow(color: (glow ?? V.pink).withValues(alpha: 0.32), blurRadius: 30, offset: const Offset(0, 10))] : null,
        ),
        child: Row(
          mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (busy) ...[
              SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: foreground)),
              const SizedBox(width: 10),
            ] else if (iconW != null && !iconAfter) ...[
              iconW,
              const SizedBox(width: 10),
            ],
            Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: VT.title(16, color: foreground, weight: foreground == Colors.white ? FontWeight.w600 : FontWeight.w700))),
            if (!busy && iconW != null && iconAfter) ...[const SizedBox(width: 10), iconW],
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          ],
        ),
      ),
    );
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: enabled
            ? () {
                HapticFeedback.lightImpact();
                onTap!();
              }
            : null,
        child: child,
      ),
    );
  }
}

/// Secondary action: a quiet translucent pill with a hairline.
class GhostButton extends StatelessWidget {
  const GhostButton({super.key, required this.label, this.onTap, this.icon, this.height = 52, this.color, this.expand = false, this.trailing, this.fill});

  final String label;
  final VoidCallback? onTap;
  final IconData? icon;
  final double height;
  final Color? color;
  final bool expand;
  final Widget? trailing;
  final Color? fill;

  @override
  Widget build(BuildContext context) {
    final c = color ?? V.text;
    return Opacity(
      opacity: onTap == null ? 0.5 : 1,
      child: Material(
        color: fill ?? Colors.white.withValues(alpha: 0.06),
        shape: StadiumBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.1))),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            height: height,
            padding: const EdgeInsets.symmetric(horizontal: 18),
            child: Row(
              mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (icon != null) ...[Icon(icon, size: 18, color: c), const SizedBox(width: 8)],
                Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: VT.title(height >= 50 ? 15 : 14, color: c, weight: FontWeight.w600))),
                if (trailing != null) ...[const SizedBox(width: 8), trailing!],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Round control for anything floating over video (match screen). Frosted
/// by default; [tint] turns it into an "on" state (e.g. Liked → pink).
class RoundControl extends StatelessWidget {
  const RoundControl({super.key, required this.icon, required this.onTap, this.size = 52, this.color, this.background, this.label, this.badge, this.tint, this.labelColor});

  final IconData icon;
  final VoidCallback? onTap;
  final double size;
  final Color? color;
  final Color? background;
  final String? label;
  final String? badge;
  final Color? tint;
  final Color? labelColor;

  @override
  Widget build(BuildContext context) {
    final bg = tint != null ? tint!.withValues(alpha: 0.22) : (background ?? V.glass);
    final border = tint != null ? tint!.withValues(alpha: 0.45) : Colors.white.withValues(alpha: background != null ? 0 : 0.14);
    final circle = ClipOval(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Material(
          color: bg,
          shape: CircleBorder(side: BorderSide(color: border)),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: SizedBox(width: size, height: size, child: Icon(icon, size: size * 0.46, color: color ?? Colors.white)),
          ),
        ),
      ),
    );
    return Semantics(
      button: true,
      label: label,
      child: SizedBox(
        width: math.max(size, 60),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Opacity(opacity: onTap == null ? 0.6 : 1, child: circle),
                if (badge != null)
                  Positioned(
                    top: -4,
                    right: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(color: V.gold, borderRadius: BorderRadius.circular(10)),
                      child: Text(badge!, style: VT.label(10, color: V.onGold, weight: FontWeight.w800)),
                    ),
                  ),
              ],
            ),
            if (label != null)
              // The label is part of the target too.
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(label!, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(11, color: labelColor ?? Colors.white.withValues(alpha: 0.85))),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Frosted panel over video.
class Glass extends StatelessWidget {
  const Glass({super.key, required this.child, this.radius = 16, this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 8), this.color, this.border, this.blur = 20, this.height});
  final Widget child;
  final double radius;
  final EdgeInsets padding;
  final Color? color;
  final Color? border;
  final double blur;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: blur, sigmaY: blur),
        child: Container(
          height: height,
          padding: padding,
          decoration: BoxDecoration(color: color ?? V.glass, borderRadius: BorderRadius.circular(radius), border: Border.all(color: border ?? Colors.white.withValues(alpha: 0.12))),
          child: child,
        ),
      ),
    );
  }
}

/// A frosted pill with an icon and a label — filters, report, interests.
class GlassPill extends StatelessWidget {
  const GlassPill({super.key, required this.label, this.icon, this.iconColor, this.tint, this.height = 32, this.onTap, this.trailing, this.textColor, this.fontSize = 12.5});
  final String label;
  final IconData? icon;
  final Color? iconColor;

  /// Colours the fill and hairline (teal = trust, pink = like, red = report).
  final Color? tint;
  final double height;
  final VoidCallback? onTap;
  final Widget? trailing;
  final Color? textColor;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    final pill = Glass(
      radius: height / 2,
      height: height,
      color: tint?.withValues(alpha: 0.18),
      border: tint?.withValues(alpha: 0.48) ?? Colors.white.withValues(alpha: 0.14),
      padding: EdgeInsets.only(left: icon == null ? 12 : 10, right: trailing == null ? 12 : 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: height * 0.5, color: iconColor ?? tint ?? Colors.white), const SizedBox(width: 6)],
          Flexible(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(fontSize, color: textColor ?? Colors.white))),
          if (trailing != null) ...[const SizedBox(width: 2), trailing!],
        ],
      ),
    );
    if (onTap == null) return pill;
    return Semantics(button: true, label: label, child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: pill));
  }
}

/// A card on a screen (not over video).
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.color, this.gradient, this.radius = V.r, this.onTap, this.border, this.borderWidth = 1});
  final Widget child;
  final EdgeInsets padding;
  final Color? color;
  final Gradient? gradient;
  final double radius;
  final VoidCallback? onTap;
  final Color? border;
  final double borderWidth;

  @override
  Widget build(BuildContext context) {
    final box = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: gradient == null ? (color ?? V.surface) : null,
        gradient: gradient,
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: border ?? V.line, width: borderWidth),
      ),
      child: child,
    );
    if (onTap == null) return box;
    return Material(
      color: Colors.transparent,
      child: InkWell(borderRadius: BorderRadius.circular(radius), onTap: onTap, child: box),
    );
  }
}

/// A grouped card of rows with inset hairlines — settings, earn, safety.
class GroupCard extends StatelessWidget {
  const GroupCard({super.key, required this.children, this.border, this.dividerInset = 70});
  final List<Widget> children;
  final Color? border;
  final double dividerInset;

  @override
  Widget build(BuildContext context) {
    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(V.r), border: Border.all(color: border ?? V.line)),
      child: Material(
        color: Colors.transparent,
        child: Column(
          children: [
            for (var i = 0; i < children.length; i++) ...[
              if (i > 0) Padding(padding: EdgeInsets.only(left: dividerInset), child: const Divider(height: 1, color: V.lineSoft)),
              children[i],
            ],
          ],
        ),
      ),
    );
  }
}

/// One row inside a [GroupCard]: tinted icon tile, title, subtitle, trailing.
class GroupRow extends StatelessWidget {
  const GroupRow({super.key, required this.icon, required this.title, this.subtitle, this.trailing, this.onTap, this.iconColor = V.text2, this.iconBg, this.titleColor, this.bare = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color iconColor;
  final Color? iconBg;
  final Color? titleColor;

  /// No icon tile — just the glyph (account rows).
  final bool bare;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 16, vertical: bare ? 16 : 14),
        child: Row(
          children: [
            if (bare)
              Icon(icon, size: 22, color: iconColor)
            else
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: iconBg ?? Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, size: 22, color: iconColor),
              ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: bare ? VT.body(15, color: titleColor ?? V.text) : VT.title(15, weight: FontWeight.w600, color: titleColor ?? V.text)),
                  if (subtitle != null) ...[const SizedBox(height: 1), Text(subtitle!, style: VT.body(12, color: V.text2, height: 1.4))],
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          ],
        ),
      ),
    );
  }
}

/// Coins balance chip — lives in most headers so the number is always in
/// sight. With [onTap] it shows a "+" bubble (top up).
class CoinChip extends StatelessWidget {
  const CoinChip({super.key, required this.coins, this.onTap, this.compact = false, this.glass = false, this.showPlus = true});
  final int coins;
  final VoidCallback? onTap;
  final bool compact;

  /// Over video: frosted fill with a gold hairline.
  final bool glass;
  final bool showPlus;

  @override
  Widget build(BuildContext context) {
    final plus = onTap != null && showPlus && !compact;
    final h = glass ? 36.0 : 34.0;
    final content = Container(
      height: h,
      padding: EdgeInsets.only(left: 10, right: plus ? 6 : 12),
      decoration: BoxDecoration(
        color: glass ? V.glass : V.gold.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(h / 2),
        border: glass ? Border.all(color: V.gold.withValues(alpha: 0.28)) : null,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          CoinIcon(size: glass ? 18 : 16),
          const SizedBox(width: 6),
          Text(Fmt.coins(coins), style: VT.number(glass ? 14 : 13.5, color: V.gold)),
          if (plus) ...[
            const SizedBox(width: 6),
            Container(
              width: glass ? 24 : 22,
              height: glass ? 24 : 22,
              decoration: BoxDecoration(shape: BoxShape.circle, color: V.gold.withValues(alpha: 0.16)),
              child: Icon(Icons.add_rounded, size: glass ? 16 : 15, color: V.gold),
            ),
          ],
        ],
      ),
    );
    final framed = glass ? ClipRRect(borderRadius: BorderRadius.circular(h / 2), child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20), child: content)) : content;
    if (onTap == null) return framed;
    return Semantics(button: true, label: '${Fmt.coins(coins)} coins. Top up', child: GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: framed));
  }
}

/// Gems balance chip (teal — gems are what you cash out).
class GemChip extends StatelessWidget {
  const GemChip({super.key, required this.gems, this.onTap});
  final int gems;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final chip = Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: V.gem.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(17)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const GemIcon(size: 16),
          const SizedBox(width: 5),
          Text(Fmt.coins(gems), style: VT.number(13.5, color: V.gem)),
        ],
      ),
    );
    if (onTap == null) return chip;
    return GestureDetector(behavior: HitTestBehavior.opaque, onTap: onTap, child: chip);
  }
}

class CoinIcon extends StatelessWidget {
  const CoinIcon({super.key, this.size = 18, this.plain = false});
  final double size;

  /// Just the gold disc, no "¢" (tiny inline prices).
  final bool plain;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.goldGrad),
      child: plain || size < 14 ? null : Center(child: Text('¢', style: TextStyle(fontFamily: V.sans, fontSize: size * 0.6, fontWeight: FontWeight.w800, color: const Color(0xFF6B4200), height: 1))),
    );
  }
}

class GemIcon extends StatelessWidget {
  const GemIcon({super.key, this.size = 18});
  final double size;
  @override
  Widget build(BuildContext context) {
    return Icon(Icons.diamond_rounded, size: size, color: V.gem);
  }
}

/// A small coin amount: gold disc + number ("● 20").
class CoinAmount extends StatelessWidget {
  const CoinAmount(this.amount, {super.key, this.size = 12, this.color = V.gold, this.locked = false});
  final int amount;
  final double size;
  final Color color;
  final bool locked;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (locked) Icon(SolarIconsBold.lockKeyhole, size: size + 1, color: V.muted) else CoinIcon(size: size, plain: true),
        const SizedBox(width: 4),
        Text(Fmt.thousands(amount), style: VT.number(size, color: locked ? V.muted : color)),
      ],
    );
  }
}

/// Network avatar with an initials fallback so the demo works offline.
/// [ring] draws the brand ring with a dark gap, as on the match recap.
class VAvatar extends StatelessWidget {
  const VAvatar({super.key, required this.url, required this.name, this.size = 48, this.ring = false, this.gapColor = V.bg, this.blur = 0, this.border});
  final String url;
  final String name;
  final double size;
  final bool ring;
  final Color gapColor;
  final double blur;
  final Color? border;

  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    Widget fallback(double s) => Container(
          width: s,
          height: s,
          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand),
          alignment: Alignment.center,
          child: Text(initial, style: VT.title(s * 0.42, color: Colors.white)),
        );
    Widget photo(double s) {
      Widget img = url.isEmpty
          ? fallback(s)
          : Image.network(
              url,
              width: s,
              height: s,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => fallback(s),
              loadingBuilder: (_, child, progress) => progress == null ? child : fallback(s),
            );
      if (blur > 0) img = ImageFiltered(imageFilter: ImageFilter.blur(sigmaX: blur, sigmaY: blur), child: img);
      return ClipOval(child: SizedBox(width: s, height: s, child: img));
    }

    if (!ring) {
      if (border == null) return photo(size);
      return Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: border!, width: 1.5)),
        child: ClipOval(child: photo(size)),
      );
    }
    final ringW = size >= 80 ? 3.0 : 2.5;
    final gapW = size >= 80 ? 3.0 : 2.0;
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(ringW),
      decoration: const BoxDecoration(shape: BoxShape.circle, gradient: V.brand),
      child: Container(
        padding: EdgeInsets.all(gapW),
        decoration: BoxDecoration(shape: BoxShape.circle, color: gapColor),
        child: photo(size - 2 * (ringW + gapW)),
      ),
    );
  }
}

/// Overlapping blurred faces — the "N people liked you" teaser.
class FaceStack extends StatelessWidget {
  const FaceStack({super.key, required this.urls, this.size = 34, this.overlap = 10, this.blur = 2.5, this.borderColor = V.surface});
  final List<String> urls;
  final double size;
  final double overlap;
  final double blur;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    final n = urls.length;
    if (n == 0) return const SizedBox.shrink();
    return SizedBox(
      width: size + (n - 1) * (size - overlap),
      height: size,
      child: Stack(
        children: [
          for (var i = 0; i < n; i++)
            Positioned(
              left: i * (size - overlap),
              child: Container(
                width: size,
                height: size,
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: borderColor, width: 2)),
                child: ClipOval(child: VAvatar(url: urls[i], name: '?', size: size - 4, blur: blur)),
              ),
            ),
        ],
      ),
    );
  }
}

/// Section label in caps ("COINS"), with optional quiet note on the right
/// or a tappable action.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.note, this.action, this.onAction, this.top = 28, this.bottom = 12});
  final String text;
  final String? note;
  final String? action;
  final VoidCallback? onAction;
  final double top;
  final double bottom;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(2, top, 2, bottom),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(child: Semantics(header: true, child: Text(text.toUpperCase(), style: VT.overline()))),
          if (note != null) Text(note!, style: VT.body(11.5, color: V.muted, height: 1.2)),
          if (action != null)
            GestureDetector(onTap: onAction, behavior: HitTestBehavior.opaque, child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Text(action!, style: VT.label(12.5, color: V.pinkSoft)))),
        ],
      ),
    );
  }
}

/// Big title for tab screens ("Store", "Chats", "Me") with room for chips or
/// an action on the right. Replaces the Material app bar on those screens.
class PageHeader extends StatelessWidget {
  const PageHeader(this.title, {super.key, this.actions = const [], this.onBack});
  final String title;
  final List<Widget> actions;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 14),
      child: Row(
        children: [
          if (onBack != null) ...[CircleIconButton(icon: SolarIconsOutline.arrowLeft, onTap: onBack!, tooltip: 'Back'), const SizedBox(width: 12)],
          Expanded(child: Semantics(header: true, child: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.display(30, height: 1.1)))),
          for (var i = 0; i < actions.length; i++) ...[if (i > 0) const SizedBox(width: 8), actions[i]],
        ],
      ),
    );
  }
}

/// App bar for pushed pages (wallet, checkout, edit profile): round back
/// button, quiet title, no tint.
PreferredSizeWidget vibeAppBar(BuildContext context, String title, {List<Widget>? actions, bool canGoBack = true}) {
  return AppBar(
    toolbarHeight: 64,
    leadingWidth: 64,
    automaticallyImplyLeading: false,
    leading: canGoBack ? Center(child: CircleIconButton(icon: SolarIconsOutline.arrowLeft, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())) : null,
    titleSpacing: canGoBack ? 0 : 20,
    title: Text(title, style: VT.title(18)),
    actions: actions == null ? null : [...actions, const SizedBox(width: 12)],
  );
}

/// 40px round icon button on a soft fill (back, close, edit).
class CircleIconButton extends StatelessWidget {
  const CircleIconButton({super.key, required this.icon, required this.onTap, this.tooltip, this.background, this.size = 40, this.iconSize = 22, this.color = V.text});
  final IconData icon;
  final VoidCallback onTap;
  final String? tooltip;
  final Color? background;
  final double size;
  final double iconSize;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final btn = Material(
      color: background ?? Colors.white.withValues(alpha: 0.08),
      shape: const CircleBorder(),
      child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: SizedBox(width: size, height: size, child: Icon(icon, size: iconSize, color: color))),
    );
    return tooltip == null ? btn : Tooltip(message: tooltip!, child: btn);
  }
}

/// A headline with an Instrument Serif italic accent:
/// `Headline('Meet someone new, ', accent: 'right now.')`.
class Headline extends StatelessWidget {
  const Headline(this.text, {super.key, this.accent, this.size = 30, this.accentColor, this.textAlign = TextAlign.start, this.accentFirst = false});
  final String text;
  final String? accent;
  final double size;
  final Color? accentColor;
  final TextAlign textAlign;

  /// Accent before the plain text.
  final bool accentFirst;

  @override
  Widget build(BuildContext context) {
    final plain = TextSpan(text: text, style: VT.display(size));
    final serif = accent == null ? null : TextSpan(text: accent, style: VT.serif(size * 1.16, color: accentColor ?? V.text));
    return Semantics(
      header: true,
      child: Text.rich(
        TextSpan(children: [if (accentFirst && serif != null) serif, plain, if (!accentFirst && serif != null) serif]),
        textAlign: textAlign,
      ),
    );
  }
}

class Tag extends StatelessWidget {
  const Tag(this.text, {super.key, this.color = V.pink, this.icon, this.textColor});
  final String text;
  final Color color;
  final IconData? icon;
  final Color? textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 22,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(11)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: textColor ?? color), const SizedBox(width: 4)],
          Text(text, style: VT.label(10.5, color: textColor ?? (color == V.pink ? V.pinkSoft : color), weight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Little green "online" dot with a soft halo.
class OnlineDot extends StatelessWidget {
  const OnlineDot({super.key, this.size = 8, this.color = V.ok});
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color, boxShadow: [BoxShadow(color: color.withValues(alpha: 0.18), spreadRadius: size / 2)]),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body, this.action, this.accent});
  final IconData icon;
  final String title;
  final String? accent;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.line)),
              child: Icon(icon, color: V.text2, size: 32),
            ),
            const SizedBox(height: 18),
            Headline(title, accent: accent, size: 22, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(body, style: VT.body(14, color: V.text2, height: 1.5), textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 22), action!],
          ],
        ),
      ),
    );
  }
}

/// Bottom sheet with the Vibe look. Returns whatever the sheet pops with.
Future<T?> showVibeSheet<T>(BuildContext context, {required Widget child, bool scrollable = false}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: const Color(0x9E050408),
    builder: (ctx) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: V.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(V.rLg)),
          border: Border(top: BorderSide(color: V.line)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(width: 36, height: 4, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 8),
              if (scrollable) Flexible(child: SingleChildScrollView(child: child)) else child,
            ],
          ),
        ),
      ),
    ),
  );
}

void toast(BuildContext context, String message, {bool error = false}) {
  final m = ScaffoldMessenger.maybeOf(context);
  if (m == null) return;
  m.hideCurrentSnackBar();
  m.showSnackBar(SnackBar(
    content: Row(
      children: [
        Icon(error ? SolarIconsOutline.dangerCircle : SolarIconsBold.checkCircle, size: 18, color: error ? V.bad : V.ok),
        const SizedBox(width: 10),
        Expanded(child: Text(message)),
      ],
    ),
    duration: const Duration(seconds: 2),
  ));
}

/// Breathing rings (splash, checkout).
class PulseRings extends StatefulWidget {
  const PulseRings({super.key, required this.child, this.size = 220, this.color = V.pink, this.active = true});
  final Widget child;
  final double size;
  final Color color;
  final bool active;

  @override
  State<PulseRings> createState() => _PulseRingsState();
}

class _PulseRingsState extends State<PulseRings> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          return Stack(
            alignment: Alignment.center,
            children: [
              if (widget.active && !reduce)
                for (final phase in const [0.0, 0.33, 0.66]) _ring(((_c.value + phase) % 1.0)),
              widget.child,
            ],
          );
        },
      ),
    );
  }

  Widget _ring(double t) {
    final scale = 0.55 + t * 0.6;
    final opacity = (1 - t) * 0.45;
    return Transform.scale(
      scale: scale,
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: widget.color.withValues(alpha: opacity), width: 1.5)),
      ),
    );
  }
}

/// The brand mark: two rings meeting — two people, one call. With
/// [animate] the rings drift apart and back together (the search loader).
class VibeMark extends StatefulWidget {
  const VibeMark({super.key, this.size = 72, this.animate = false, this.stroke});
  final double size;
  final bool animate;

  /// Ring thickness as a fraction of [size]; defaults to the logo's 0.092.
  final double? stroke;

  @override
  State<VibeMark> createState() => _VibeMarkState();
}

class _VibeMarkState extends State<VibeMark> with SingleTickerProviderStateMixin {
  AnimationController? _c;

  @override
  void initState() {
    super.initState();
    if (widget.animate) _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    final ring = s * 0.62;
    final stroke = s * (widget.stroke ?? 0.092);
    final reduce = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    Widget rings(double t) {
      // t: 0 = overlapping like the logo, 1 = pulled a little apart.
      final drift = s * 0.07 * t;
      return Stack(
        children: [
          Positioned(left: s * 0.06 - drift, top: (s - ring) / 2, child: _ring(ring, stroke, V.pink)),
          Positioned(right: s * 0.06 - drift, top: (s - ring) / 2, child: _ring(ring, stroke, V.violet)),
        ],
      );
    }

    return Semantics(
      label: 'Vibe',
      child: SizedBox(
        width: s,
        height: s,
        child: _c == null || reduce ? rings(0) : AnimatedBuilder(animation: _c!, builder: (_, __) => rings(Curves.easeInOut.transform(_c!.value))),
      ),
    );
  }

  Widget _ring(double d, double stroke, Color c) => Container(width: d, height: d, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: c, width: stroke)));
}

/// The Vibe logo / app icon (option 1b of "Vibe App Icon"): two white rings
/// on the pink→violet gradient tile. Same artwork as the launcher icons; use it
/// wherever the brand is shown on its own (splash, sign-in, headers).
/// [VibeMark] stays the bare two-colour rings (loader, small badges).
class VibeLogo extends StatelessWidget {
  const VibeLogo({super.key, this.size = 72, this.shadow = true});
  final double size;

  /// Soft pink glow under the tile, as in the icon artwork.
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Vibe',
      image: true,
      child: Container(
        width: size,
        height: size,
        decoration: shadow
            ? BoxDecoration(
                borderRadius: BorderRadius.circular(size * _VibeLogoPainter.radius),
                boxShadow: [BoxShadow(color: V.pink.withValues(alpha: 0.35), blurRadius: size * 0.25, offset: Offset(0, size * 0.1))],
              )
            : null,
        child: CustomPaint(painter: const _VibeLogoPainter()),
      ),
    );
  }
}

/// Paints the icon on a 240-unit grid scaled to the widget size.
class _VibeLogoPainter extends CustomPainter {
  const _VibeLogoPainter();

  static const double radius = 56 / 240;

  @override
  void paint(Canvas canvas, Size size) {
    final k = size.width / 240;
    final rect = Offset.zero & size;
    canvas.save();
    canvas.clipRRect(RRect.fromRectAndRadius(rect, Radius.circular(56 * k)));
    canvas.drawRect(
      rect,
      Paint()..shader = const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [V.pink, Color(0xFFB14BC9), V.violet], stops: [0, 0.52, 1]).createShader(rect),
    );
    // Soft highlight top-left.
    canvas.drawRect(
      rect,
      Paint()..shader = RadialGradient(center: const Alignment(70 / 120 - 1, 60 / 120 - 1), radius: 100 / 240, colors: [Colors.white.withValues(alpha: 0.22), Colors.white.withValues(alpha: 0)], stops: const [0, 0.7]).createShader(rect),
    );
    final ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14 * k;
    canvas.drawCircle(Offset(94 * k, 120 * k), 42 * k, ring..color = Colors.white);
    canvas.drawCircle(Offset(146 * k, 120 * k), 42 * k, ring..color = Colors.white.withValues(alpha: 0.55));
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Top/bottom scrims that keep text legible over video without dimming
/// the whole picture.
class VideoScrims extends StatelessWidget {
  const VideoScrims({super.key, this.top = 200, this.bottom = 500, this.topAlpha = 0.78, this.bottomAlpha = 0.97, this.bottomMid = 0.82});
  final double top;
  final double bottom;
  final double topAlpha;
  final double bottomAlpha;
  final double bottomMid;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: top,
            child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [V.bg.withValues(alpha: topAlpha), V.bg.withValues(alpha: 0)]))),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: bottom,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(begin: Alignment.bottomCenter, end: Alignment.topCenter, stops: const [0, 0.45, 1], colors: [V.bg.withValues(alpha: bottomAlpha), V.bg.withValues(alpha: bottomMid), V.bg.withValues(alpha: 0)]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
