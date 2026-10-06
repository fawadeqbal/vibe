import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../models/models.dart';
import '../../models/partner.dart';
import '../../providers/partner_provider.dart';
import '../../services/app_services.dart';
import '../invite/invite_share.dart';
import 'partner_widgets.dart';

/// Links per channel: your partner link tagged `?s=tiktok` … so the stats
/// split by where people came from. Copy or share the one you picked.
class PartnerLinksScreen extends StatefulWidget {
  const PartnerLinksScreen({super.key});

  @override
  State<PartnerLinksScreen> createState() => _PartnerLinksScreenState();
}

class _PartnerLinksScreenState extends State<PartnerLinksScreen> {
  String? _source;

  @override
  Widget build(BuildContext context) {
    final terms = context.select<PartnerProvider, PartnerTerms?>((p) => p.overview?.terms);
    return Scaffold(
      appBar: vibeAppBar(context, 'Links per channel'),
      body: terms == null
          ? const SizedBox.shrink()
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
              children: [
                Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('YOUR CODE', style: VT.overline()),
                      const SizedBox(height: 2),
                      Text(terms.code, style: VT.mono(22, color: V.text, weight: FontWeight.w600)),
                      const SizedBox(height: 14),
                      Text('WHERE YOU\'LL POST IT', style: VT.overline()),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final s in <String?>[null, ...partnerLinkSources])
                            PartnerChip(label: s == null ? 'Any' : partnerSourceLabel(s), selected: s == _source, outlined: true, onTap: () => setState(() => _source = s)),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Semantics(
                        label: 'Link: ${partnerLink(terms.link, _source)}',
                        excludeSemantics: true,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          decoration: BoxDecoration(color: V.surface2, borderRadius: BorderRadius.circular(14)),
                          child: Text(bareLink(partnerLink(terms.link, _source)), style: VT.mono(13, color: V.text)),
                        ),
                      ),
                      const SizedBox(height: 12),
                      PartnerLinkActions(url: partnerLink(terms.link, _source), height: 46),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Text(
                  'Each channel gets its own line in your stats. Any link works for sign-ups — people get ${Economy.inviteeRewardCoins} free coins either way.',
                  textAlign: TextAlign.center,
                  style: VT.body(12, color: V.muted, height: 1.45),
                ),
              ],
            ),
    );
  }
}

/// Copy link · Share, for a partner link.
class PartnerLinkActions extends StatelessWidget {
  const PartnerLinkActions({super.key, required this.url, this.height = 52});
  final String url;
  final double height;

  Future<void> _copy(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: url));
    if (context.mounted) toast(context, 'Link copied');
  }

  Future<void> _share(BuildContext context) async {
    final share = context.read<AppServices>().share;
    if (await share.shareText(inviteMessage(url))) return;
    if (context.mounted) await _copy(context);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: GhostButton(label: 'Copy link', icon: Icons.copy_rounded, height: height, expand: true, onTap: () => _copy(context))),
        const SizedBox(width: 10),
        Expanded(child: GhostButton(label: 'Share', icon: Icons.ios_share_rounded, height: height, expand: true, onTap: () => _share(context))),
      ],
    );
  }
}
