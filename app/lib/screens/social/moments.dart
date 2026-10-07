import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/moments_provider.dart';
import '../../providers/wallet_provider.dart';
import '../../services/app_services.dart';
import '../../services/media/image_prep.dart';
import '../match/report_sheet.dart';

/// The row of moments at the top of Chats: "Your moment" first (+ to add),
/// then people with something new (gradient ring) before the ones you've
/// seen (grey ring).
class MomentsBar extends StatelessWidget {
  const MomentsBar({super.key});

  @override
  Widget build(BuildContext context) {
    final moments = context.watch<MomentsProvider>();
    final mine = moments.mine;
    final people = moments.people;
    if (mine == null) return const SizedBox.shrink();
    return SizedBox(
      height: 98,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
        children: [
          _Bubble(
            key: const ValueKey('moment-mine'),
            name: 'Your moment',
            url: mine.author.avatarUrl,
            ring: mine.moments.isEmpty ? _Ring.none : _Ring.seen,
            busy: moments.posting,
            plus: true,
            onTap: () => mine.moments.isEmpty ? postMomentFlow(context) : openMoments(context, [mine], 0),
            onPlus: () => postMomentFlow(context),
          ),
          for (var i = 0; i < people.length; i++)
            _Bubble(
              key: ValueKey('moment-${people[i].author.id}'),
              name: people[i].author.name,
              url: people[i].author.avatarUrl,
              ring: people[i].allSeen ? _Ring.seen : _Ring.unseen,
              onTap: () => openMoments(context, people, i),
            ),
        ],
      ),
    );
  }
}

enum _Ring { none, seen, unseen }

class _Bubble extends StatelessWidget {
  const _Bubble({super.key, required this.name, required this.url, required this.ring, required this.onTap, this.plus = false, this.onPlus, this.busy = false});
  final String name;
  final String url;
  final _Ring ring;
  final VoidCallback onTap;
  final bool plus;
  final VoidCallback? onPlus;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    const size = 64.0;
    final Widget face = switch (ring) {
      _Ring.unseen => VAvatar(url: url, name: name, size: size, ring: true),
      _Ring.seen => Container(
          width: size,
          height: size,
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: V.lineStrong, width: 2)),
          child: VAvatar(url: url, name: name, size: size - 8),
        ),
      _Ring.none => Padding(padding: const EdgeInsets.all(4), child: VAvatar(url: url, name: name, size: size - 8)),
    };
    return Semantics(
      button: true,
      label: plus ? 'Your moment' : '$name\'s moment${ring == _Ring.unseen ? ', new' : ''}',
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: busy ? null : onTap,
        child: SizedBox(
          width: 74,
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Opacity(opacity: ring == _Ring.seen && !plus ? 0.75 : 1, child: face),
                  if (busy) const Positioned.fill(child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4)))),
                  if (plus)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: GestureDetector(
                        onTap: busy ? null : onPlus,
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: BoxDecoration(shape: BoxShape.circle, color: V.violet, border: Border.all(color: V.bg, width: 2.5)),
                          child: const Icon(Icons.add_rounded, size: 14, color: Colors.white),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 5),
              Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.label(11.5, color: ring == _Ring.unseen ? V.text : V.text2, weight: FontWeight.w500)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Pick a photo (same picker + resize as the profile photo), add a caption, post.
Future<void> postMomentFlow(BuildContext context) async {
  final moments = context.read<MomentsProvider>();
  AppServices? services;
  try {
    services = context.read<AppServices>();
  } catch (_) {}
  final media = services?.media;
  Uint8List? bytes;
  var type = 'image/jpeg';
  if (media != null && media.available) {
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
      if (photo == null) return;
      bytes = photo.bytes;
      type = photo.contentType;
    } on FormatException catch (e) {
      if (context.mounted) toast(context, e.message, error: true);
      return;
    } catch (_) {
      if (context.mounted) toast(context, "Couldn't open the camera or gallery. Check Vibe's permissions.", error: true);
      return;
    }
  } else if (context.read<WalletProvider>().isRemote) {
    toast(context, 'Posting moments needs the phone app', error: true);
    return;
  }
  if (!context.mounted) return;
  final caption = await showVibeSheet<String>(context, child: _CaptionSheet(bytes: bytes));
  if (caption == null || !context.mounted) return;
  try {
    await moments.post(bytes ?? Uint8List(0), contentType: type, caption: caption);
    if (context.mounted) toast(context, 'Moment posted · gone in 24 hours');
  } on ApiException catch (e) {
    if (context.mounted) toast(context, e.message, error: true);
  }
}

class _CaptionSheet extends StatefulWidget {
  const _CaptionSheet({this.bytes});
  final Uint8List? bytes;

  @override
  State<_CaptionSheet> createState() => _CaptionSheetState();
}

class _CaptionSheetState extends State<_CaptionSheet> {
  final _caption = TextEditingController();

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.bytes;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Headline('Share a ', accent: 'moment', size: 24),
          const SizedBox(height: 6),
          Text('Your followers and friends see it for 24 hours.', style: VT.body(13, color: V.text2)),
          if (b != null && b.isNotEmpty && ImagePrep.sniff(b) != null) ...[
            const SizedBox(height: 14),
            Center(child: ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.memory(b, height: 220, fit: BoxFit.cover))),
          ],
          const SizedBox(height: 14),
          TextField(controller: _caption, maxLength: 120, maxLines: 2, minLines: 1, decoration: const InputDecoration(hintText: 'Add a caption (optional)')),
          const SizedBox(height: 8),
          GradientButton(label: 'Post', icon: SolarIconsBold.plain, onTap: () => Navigator.of(context).pop(_caption.text)),
        ],
      ),
    );
  }
}

/// Opens the full-screen viewer at [groups][index].
Future<void> openMoments(BuildContext context, List<MomentGroup> groups, int index) {
  return Navigator.of(context).push(PageRouteBuilder<void>(
    opaque: true,
    pageBuilder: (_, __, ___) => MomentViewerScreen(groups: groups, initialGroup: index),
    transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
  ));
}

/// Full-screen moments: a progress bar per photo, 5 s each, tap right/left
/// to skip, hold to pause. Your own: who saw it, delete. Others: report.
class MomentViewerScreen extends StatefulWidget {
  const MomentViewerScreen({super.key, required this.groups, this.initialGroup = 0});
  final List<MomentGroup> groups;
  final int initialGroup;

  static const perMoment = Duration(seconds: 5);

  @override
  State<MomentViewerScreen> createState() => _MomentViewerScreenState();
}

class _MomentViewerScreenState extends State<MomentViewerScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _timer = AnimationController(vsync: this, duration: MomentViewerScreen.perMoment)..addStatusListener(_onDone);
  late int _g = widget.initialGroup;
  late int _i = widget.groups[widget.initialGroup].mine ? 0 : widget.groups[widget.initialGroup].firstUnseen;
  bool _held = false;
  bool _closing = false;

  MomentGroup get _group => widget.groups[_g];
  Moment get _moment => _group.moments[_i];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _show());
  }

  @override
  void dispose() {
    _timer.dispose();
    super.dispose();
  }

  void _show() {
    if (!mounted) return;
    if (!_group.mine) context.read<MomentsProvider>().markSeen(_moment);
    _timer.forward(from: 0);
    setState(() {});
  }

  void _onDone(AnimationStatus s) {
    if (s == AnimationStatus.completed) _next();
  }

  void _close() {
    if (_closing) return;
    _closing = true;
    Navigator.of(context).maybePop();
  }

  void _next() {
    if (_i < _group.moments.length - 1) {
      _i++;
    } else if (_g < widget.groups.length - 1) {
      _g++;
      _i = _group.firstUnseen;
    } else {
      return _close();
    }
    _show();
  }

  void _prev() {
    if (_i > 0) {
      _i--;
    } else if (_g > 0) {
      _g--;
      _i = 0;
    } else {
      _i = 0;
    }
    _show();
  }

  void _pause(bool held) {
    setState(() => _held = held);
    if (held) {
      _timer.stop();
    } else if (!_closing) {
      _timer.forward();
    }
  }

  /// Runs [fn] with the timer paused (sheets, dialogs).
  Future<void> _paused(Future<void> Function() fn) async {
    _timer.stop();
    try {
      await fn();
    } finally {
      if (mounted && !_closing && !_held) _timer.forward();
    }
  }

  Future<void> _viewers() => _paused(() async {
        final list = await context.read<MomentsProvider>().viewers(_moment.id);
        if (!mounted) return;
        await showVibeSheet<void>(context, scrollable: true, child: _ViewersSheet(viewers: list));
      });

  Future<void> _delete() => _paused(() async {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Delete this moment?'),
            content: const Text('It disappears for everyone right away.'),
            actions: [
              TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
              TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Delete', style: TextStyle(color: V.bad))),
            ],
          ),
        );
        if (ok != true || !mounted) return;
        try {
          await context.read<MomentsProvider>().delete(_moment.id);
          if (mounted) {
            toast(context, 'Moment deleted');
            _close();
          }
        } on ApiException catch (e) {
          if (mounted) toast(context, e.message, error: true);
        }
      });

  Future<void> _report() => _paused(() async {
        final name = _group.author.name;
        final choice = await showReportSheet(context, name: name);
        if (choice == null || !mounted) return;
        try {
          await context.read<MomentsProvider>().report(_moment.id, choice.reason, note: choice.note, block: choice.block);
          if (mounted) {
            toast(context, 'Thanks. $name was reported${choice.block ? ' and blocked' : ''}.');
            if (choice.block) _close();
          }
        } on ApiException catch (e) {
          if (mounted) toast(context, e.message, error: true);
        }
      });

  @override
  Widget build(BuildContext context) {
    final g = _group;
    final m = _moment;
    final media = MediaQuery.of(context);
    // Own view counts update after a viewers fetch.
    final live = g.mine ? (context.watch<MomentsProvider>().mine?.moments.firstWhere((x) => x.id == m.id, orElse: () => m) ?? m) : m;
    return Scaffold(
      backgroundColor: Colors.black,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapUp: (d) => d.localPosition.dx < media.size.width / 3 ? _prev() : _next(),
          onLongPressStart: (_) => _pause(true),
          onLongPressEnd: (_) => _pause(false),
          onVerticalDragEnd: (d) {
            if ((d.primaryVelocity ?? 0) > 300) _close();
          },
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                m.mediaUrl,
                key: ValueKey(m.id),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(colors: [Color(0xFF2B1B4D), V.bg], begin: Alignment.topCenter, end: Alignment.bottomCenter))),
              ),
              const VideoScrims(top: 180, bottom: 260, topAlpha: 0.7, bottomAlpha: 0.85, bottomMid: 0.4),
              // Progress bars + who/when + actions.
              Positioned(
                left: 12,
                right: 12,
                top: media.padding.top + 8,
                child: Column(
                  children: [
                    Row(
                      children: [
                        for (var k = 0; k < g.moments.length; k++) ...[
                          if (k > 0) const SizedBox(width: 4),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(2),
                              child: SizedBox(
                                height: 3,
                                child: k == _i
                                    ? AnimatedBuilder(animation: _timer, builder: (_, __) => LinearProgressIndicator(value: _timer.value, backgroundColor: Colors.white.withValues(alpha: 0.28), color: Colors.white))
                                    : ColoredBox(color: k < _i ? Colors.white : Colors.white.withValues(alpha: 0.28)),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        VAvatar(url: g.author.avatarUrl, name: g.author.name, size: 34),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text.rich(
                            TextSpan(children: [
                              TextSpan(text: g.mine ? 'Your moment' : g.author.name, style: VT.title(14.5, weight: FontWeight.w600)),
                              TextSpan(text: '  ${Fmt.agoShort(m.createdAt)}', style: VT.body(12.5, color: Colors.white.withValues(alpha: 0.7))),
                            ]),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (_held) const Padding(padding: EdgeInsets.only(right: 4), child: Icon(SolarIconsBold.pause, size: 20, color: Colors.white)),
                        if (g.mine)
                          IconButton(tooltip: 'Delete', onPressed: _delete, icon: const Icon(SolarIconsOutline.trashBinMinimalistic, color: Colors.white))
                        else
                          PopupMenuButton<String>(
                            tooltip: 'More',
                            icon: const Icon(SolarIconsBold.menuDots, color: Colors.white),
                            onOpened: () => _timer.stop(),
                            onCanceled: () => _held ? null : _timer.forward(),
                            onSelected: (v) {
                              if (v == 'report') _report();
                            },
                            itemBuilder: (_) => const [PopupMenuItem(value: 'report', child: Text('Report', style: TextStyle(color: V.bad)))],
                          ),
                        IconButton(tooltip: 'Close', onPressed: _close, icon: const Icon(Icons.close_rounded, color: Colors.white)),
                      ],
                    ),
                  ],
                ),
              ),
              Positioned(
                left: 20,
                right: 20,
                bottom: media.padding.bottom + 22,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (m.caption.isNotEmpty) Text(m.caption, style: VT.body(16, color: Colors.white, height: 1.35)),
                    if (g.mine) ...[
                      const SizedBox(height: 12),
                      GlassPill(
                        icon: SolarIconsBold.eye,
                        label: '${live.viewsCount ?? 0} ${live.viewsCount == 1 ? 'view' : 'views'}',
                        height: 36,
                        fontSize: 13,
                        onTap: _viewers,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ViewersSheet extends StatelessWidget {
  const _ViewersSheet({required this.viewers});
  final List<MomentViewer> viewers;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(viewers.isEmpty ? 'No views yet' : 'Seen by ${viewers.length}', style: VT.title(20)),
          const SizedBox(height: 12),
          if (viewers.isEmpty) Text('Your followers and friends will show up here when they look.', style: VT.body(13.5, color: V.text2)),
          for (final v in viewers)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  VAvatar(url: v.profile.avatarUrl, name: v.profile.name, size: 40),
                  const SizedBox(width: 12),
                  Expanded(child: Text(v.profile.name, style: VT.title(15, weight: FontWeight.w600))),
                  Text(Fmt.agoShort(v.at), style: VT.label(12, color: V.muted, weight: FontWeight.w400)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
