import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_client.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';

class _Group {
  _Group(Map<String, dynamic> m)
      : key = m['key'] as String,
        label = m['label'] as String? ?? '',
        description = m['description'] as String? ?? '',
        locked = m['locked'] == true,
        on = {for (final c in _channels) c.key: m[c.key] != false};
  final String key;
  final String label;
  final String description;
  final bool locked;
  final Map<String, bool> on;
}

class _Channel {
  const _Channel(this.key, this.label, this.icon);
  final String key;
  final String label;
  final IconData icon;
}

const _channels = [
  _Channel('push', 'Phone', SolarIconsOutline.bell),
  _Channel('inApp', 'Inbox', SolarIconsOutline.inbox),
  _Channel('email', 'E-mail', SolarIconsOutline.letter),
];

const _icons = <String, IconData>{
  'messages': SolarIconsBold.chatRound,
  'calls': SolarIconsBold.videocamera,
  'friends': SolarIconsBold.heart,
  'reminders': SolarIconsBold.alarm,
  'money': SolarIconsBold.wallet,
  'team': SolarIconsBold.letter,
  'account': SolarIconsBold.shieldCheck,
};

/// Me → Notifications: what reaches you, per group, on the phone, in your
/// inbox and by e-mail. Account alerts always stay on.
class NotifyChoices extends StatefulWidget {
  const NotifyChoices({super.key});

  @override
  State<NotifyChoices> createState() => _NotifyChoicesState();
}

class _NotifyChoicesState extends State<NotifyChoices> {
  ApiClient? _api;
  List<_Group>? _groups;

  @override
  void initState() {
    super.initState();
    try {
      _api = context.read<ApiClient>();
    } catch (_) {
      _api = null; // demo mode: no server
    }
    _load();
  }

  List<_Group> _parse(dynamic r) => [for (final g in ((r as Map)['groups'] as List? ?? const [])) _Group(Map<String, dynamic>.from(g as Map))];

  Future<void> _load() async {
    if (_api == null) return;
    try {
      final r = await _api!.get('/me/notifications');
      if (mounted) setState(() => _groups = _parse(r));
    } catch (_) {
      if (mounted) setState(() => _groups = const []);
    }
  }

  Future<void> _flip(_Group g, String channel) async {
    final on = !(g.on[channel] ?? true);
    setState(() => g.on[channel] = on);
    try {
      final r = await _api!.put('/me/notifications', {'group': g.key, 'channel': channel, 'on': on});
      if (mounted) setState(() => _groups = _parse(r));
    } catch (_) {
      if (!mounted) return;
      setState(() => g.on[channel] = !on);
      toast(context, "Couldn't save that, try again", error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final groups = _groups;
    if (_api == null || (groups != null && groups.isEmpty)) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SectionTitle('What we tell you', top: 4),
        GroupCard(
          children: groups == null
              ? [const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(strokeWidth: 2)))]
              : [for (final g in groups) _row(g)],
        ),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _row(_Group g) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(12)),
                child: Icon(_icons[g.key] ?? SolarIconsBold.bell, size: 22, color: V.text2),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(g.label, style: VT.title(15, weight: FontWeight.w600)),
                    const SizedBox(height: 1),
                    Text(g.description, style: VT.body(12, color: V.text2)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(left: 54),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in _channels)
                  _Chip(
                    label: c.label,
                    icon: (g.on[c.key] ?? true) ? SolarIconsOutline.checkCircle : c.icon,
                    on: g.on[c.key] ?? true,
                    onTap: g.locked ? null : () => _flip(g, c.key),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.icon, required this.on, this.onTap});
  final String label;
  final IconData icon;
  final bool on;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final color = on ? V.trust : V.muted;
    return Semantics(
      toggled: on,
      button: true,
      label: label,
      child: Opacity(
        opacity: onTap == null ? 0.6 : 1,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            height: 32,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: on ? V.trust.withValues(alpha: 0.12) : Colors.transparent,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: on ? V.trust.withValues(alpha: 0.4) : V.lineSoft),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 15, color: color),
                const SizedBox(width: 4),
                Text(label, style: VT.label(12, color: color)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
