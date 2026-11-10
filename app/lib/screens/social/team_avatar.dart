import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';

/// The round "V" used for the Vibe team (Notifications, its message pages).
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
