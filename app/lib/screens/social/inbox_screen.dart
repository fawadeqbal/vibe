import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/inbox_provider.dart';

/// "Messages from Vibe": everything the team has sent this person from the
/// admin panel, newest first. Opening the screen marks them read.
class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      final inbox = context.read<InboxProvider>();
      if (inbox.hasMore && _scroll.position.extentAfter < 400) inbox.loadMore();
    });
    // After the first frame so the unread styling is seen for a moment.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      Future<void>.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) context.read<InboxProvider>().markAllRead();
      });
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inbox = context.watch<InboxProvider>();
    final items = inbox.messages;
    return Scaffold(
      appBar: vibeAppBar(context, 'Messages from Vibe'),
      body: items.isEmpty
          ? const EmptyState(icon: SolarIconsOutline.letterOpened, title: 'Nothing ', accent: 'yet', body: 'News and notes from the Vibe team will show up here.')
          : RefreshIndicator(
              color: V.pink,
              onRefresh: inbox.load,
              child: ListView.separated(
                controller: _scroll,
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                itemCount: items.length + (inbox.hasMore ? 1 : 0),
                separatorBuilder: (_, _) => const SizedBox(height: 12),
                itemBuilder: (context, i) {
                  if (i == items.length) {
                    return const Padding(
                      padding: EdgeInsets.all(16),
                      child: Center(
                        child: SizedBox.square(dimension: 22, child: CircularProgressIndicator(strokeWidth: 2, color: V.pink)),
                      ),
                    );
                  }
                  return _MessageCard(m: items[i]);
                },
              ),
            ),
    );
  }
}

class _MessageCard extends StatelessWidget {
  const _MessageCard({required this.m});
  final TeamMessage m;

  @override
  Widget build(BuildContext context) {
    final url = m.buttonUrl;
    return Semantics(
      container: true,
      label: m.read ? null : 'Unread',
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: V.surface,
          borderRadius: BorderRadius.circular(V.r),
          border: Border.all(color: m.read ? V.line : V.pink.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const TeamAvatar(size: 30),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('Vibe team · ${Fmt.agoShort(m.at)}', style: VT.body(12.5, color: V.text2)),
                ),
                if (!m.read)
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(color: V.pink, shape: BoxShape.circle),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Text(m.title, style: VT.title(17, weight: FontWeight.w600)),
            const SizedBox(height: 6),
            RichBody(m.body),
            if (m.buttonLabel != null && url != null) ...[
              const SizedBox(height: 14),
              GradientButton(label: m.buttonLabel!, height: 44, icon: SolarIconsBold.squareArrowRightUp, iconAfter: true, onTap: () => openLink(context, url)),
            ],
          ],
        ),
      ),
    );
  }
}

/// The round "V" used for the Vibe team, here and in the Chats row.
class TeamAvatar extends StatelessWidget {
  const TeamAvatar({super.key, this.size = 52});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(gradient: V.brand, borderRadius: BorderRadius.circular(size * 0.32)),
      child: Text(
        'V',
        style: VT.title(size * 0.46, weight: FontWeight.w700, color: Colors.white),
      ),
    );
  }
}

Future<void> openLink(BuildContext context, String url) async {
  final uri = Uri.tryParse(url);
  final ok = uri != null && (uri.scheme == 'https' || uri.scheme == 'mailto') && await launchUrl(uri, mode: LaunchMode.externalApplication).catchError((_) => false);
  if (!ok && context.mounted) toast(context, "Couldn't open the link", error: true);
}

/// Message text with the same light formatting the e-mail uses:
/// blank line = paragraph, **bold**, [label](https://…) links.
class RichBody extends StatefulWidget {
  const RichBody(this.text, {super.key});
  final String text;

  @override
  State<RichBody> createState() => _RichBodyState();
}

class _RichBodyState extends State<RichBody> {
  final _recognizers = <TapGestureRecognizer>[];
  static final _token = RegExp(r'\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:https://|mailto:)[^)\s]+)\)');

  @override
  void dispose() {
    for (final r in _recognizers) {
      r.dispose();
    }
    super.dispose();
  }

  List<InlineSpan> _spans(String text) {
    final base = VT.body(14.5, color: V.text2, height: 1.45);
    final out = <InlineSpan>[];
    var at = 0;
    for (final m in _token.allMatches(text)) {
      if (m.start > at) out.add(TextSpan(text: text.substring(at, m.start), style: base));
      if (m.group(1) != null) {
        out.add(
          TextSpan(
            text: m.group(1),
            style: base.copyWith(color: V.text, fontWeight: FontWeight.w600),
          ),
        );
      } else {
        final url = m.group(3)!;
        final r = TapGestureRecognizer()..onTap = () => openLink(context, url);
        _recognizers.add(r);
        out.add(
          TextSpan(
            text: m.group(2),
            style: base.copyWith(color: V.pinkSoft, decoration: TextDecoration.underline, decorationColor: V.pinkSoft),
            recognizer: r,
          ),
        );
      }
      at = m.end;
    }
    if (at < text.length) out.add(TextSpan(text: text.substring(at), style: base));
    return out;
  }

  @override
  Widget build(BuildContext context) {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
    return Text.rich(TextSpan(children: _spans(widget.text.trim())));
  }
}
