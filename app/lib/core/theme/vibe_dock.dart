import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'vibe_theme.dart';

/// One destination in the [VibeDock].
class VibeDockItem {
  const VibeDockItem({required this.icon, required this.activeIcon, required this.label, this.badge = 0, this.glyph});
  final IconData icon;
  final IconData activeIcon;
  final String label;

  /// Unread count. 0 hides the badge; above 99 reads "99+".
  final int badge;

  /// Draws the icon instead of [icon]/[activeIcon] (for glyphs that aren't
  /// in an icon font, like the web's Discover card).
  final Widget Function(bool on, double size, Color color)? glyph;
}

/// The tab bar, the same as the web app's bottom bar
/// (web/src/components/layout/app-shell.tsx): a flat 64px bar on the page
/// ground under a hairline, five equal tabs. The selected tab's icon sits
/// in a soft pink pill (56×30) and turns pink, its label turns white; the
/// others are muted. Over the camera on Match the bar is frosted (88% ground,
/// 20px blur).
///
/// Put it in `Scaffold.bottomNavigationBar` with `extendBody: true`: the
/// body then gets the bar's height as bottom padding.
class VibeDock extends StatelessWidget {
  const VibeDock({super.key, required this.items, required this.index, required this.onTap, this.overVideo = false});

  final List<VibeDockItem> items;
  final int index;
  final ValueChanged<int> onTap;
  final bool overVideo;

  /// Height of the tab row (the hairline and the safe area come on top).
  static const double barHeight = 64;

  @override
  Widget build(BuildContext context) {
    final bar = DecoratedBox(
      decoration: BoxDecoration(
        color: overVideo ? V.bg.withValues(alpha: 0.88) : V.bg,
        border: const Border(top: BorderSide(color: V.lineSoft)),
      ),
      // The hairline sits on top of the 64px row, like the web's border-top.
      child: Padding(
        padding: const EdgeInsets.only(top: 1),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: barHeight,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: _Tab(item: items[i], on: i == index, onTap: () => onTap(i)),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.2,
      child: overVideo
          ? ClipRect(
              child: BackdropFilter(filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20), child: bar),
            )
          : bar,
    );
  }
}

/// One destination: the pill indicator, icon, badge and label.
class _Tab extends StatefulWidget {
  const _Tab({required this.item, required this.on, required this.onTap});
  final VibeDockItem item;
  final bool on;
  final VoidCallback onTap;

  @override
  State<_Tab> createState() => _TabState();
}

class _TabState extends State<_Tab> {
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    final on = widget.on;
    final iconColor = on ? V.pink : V.muted;
    final reduce = MediaQuery.of(context).disableAnimations;
    final icon = it.glyph?.call(on, 23, iconColor) ?? Icon(on ? it.activeIcon : it.icon, size: 23, color: iconColor);

    return Semantics(
      selected: on,
      button: true,
      inMutuallyExclusiveGroup: true,
      label: it.badge > 0 ? '${it.label}, ${it.badge} new' : it.label,
      excludeSemantics: true,
      onTap: widget.onTap,
      child: FocusableActionDetector(
        actions: {ActivateIntent: CallbackAction<ActivateIntent>(onInvoke: (_) => widget.onTap())},
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            HapticFeedback.selectionClick();
            widget.onTap();
          },
          child: Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AnimatedContainer(
                    duration: reduce ? Duration.zero : const Duration(milliseconds: 200),
                    curve: Curves.easeOut,
                    width: 56,
                    height: 30,
                    decoration: BoxDecoration(
                      color: on ? V.pink.withValues(alpha: 0.16) : Colors.transparent,
                      borderRadius: BorderRadius.circular(15),
                      border: _focused ? Border.all(color: V.lavender, width: 2) : null,
                    ),
                    child: Stack(
                      clipBehavior: Clip.none,
                      alignment: Alignment.center,
                      children: [
                        icon,
                        Positioned(left: 32, top: 1, child: _Badge(count: it.badge)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    it.label,
                    maxLines: 1,
                    softWrap: false,
                    style: VT.label(11, color: on ? V.text : V.muted, weight: on ? FontWeight.w600 : FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Unread count: a small pink pill on the icon's corner.
class _Badge extends StatelessWidget {
  const _Badge({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    if (count <= 0) return const SizedBox.shrink();
    return Container(
      constraints: const BoxConstraints(minWidth: 16),
      height: 16,
      padding: const EdgeInsets.symmetric(horizontal: 4),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: V.pink, borderRadius: BorderRadius.circular(8)),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: VT.label(10, color: Colors.white, weight: FontWeight.w700),
      ),
    );
  }
}
