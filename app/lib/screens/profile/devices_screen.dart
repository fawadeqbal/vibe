import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/models.dart';
import '../../providers/session_provider.dart';
import 'me_sections.dart' show signOutFlow;

/// Settings → Devices: every phone and browser you're signed in on, this
/// one first. Sign one out (it goes back to sign-in straight away), or every
/// other one at once — for a lost phone or a shared computer.
class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  List<DeviceSession>? _items;
  bool _failed = false;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await context.read<SessionProvider>().devices();
      if (mounted) setState(() => (_items = d, _failed = false));
    } on ApiException catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<bool> _confirm(String title, String body, String ok) async =>
      await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
            TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(ok, style: const TextStyle(color: V.bad))),
          ],
        ),
      ) ==
      true;

  Future<void> _end(DeviceSession d) async {
    if (!await _confirm('Sign out ${d.device}?', 'It goes back to the sign-in screen right away. You can sign in there again any time.', 'Sign out')) return;
    if (!mounted) return;
    setState(() => _busy = d.id);
    final session = context.read<SessionProvider>();
    try {
      await session.endDevice(d.id);
      if (!mounted) return;
      setState(() => _items = _items?.where((x) => x.id != d.id).toList());
      toast(context, 'Signed out ${d.device}');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
      await _load();
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _endOthers(int n) async {
    if (!await _confirm('Sign out every other device?', '$n ${n == 1 ? 'device goes' : 'devices go'} back to sign-in. This phone stays signed in.', 'Sign out all')) return;
    if (!mounted) return;
    setState(() => _busy = 'others');
    final session = context.read<SessionProvider>();
    try {
      await session.endOtherDevices();
      if (!mounted) return;
      setState(() => _items = _items?.where((x) => x.current).toList());
      toast(context, 'Signed out of every other device');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    final others = items?.where((d) => !d.current).length ?? 0;
    return Scaffold(
      appBar: vibeAppBar(context, 'Devices'),
      body: RefreshIndicator(
        color: V.pink,
        onRefresh: _load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 12),
              child: Text("Where you're signed in to Vibe. Don't recognise one? Sign it out.", style: VT.body(13.5, color: V.text2, height: 1.5)),
            ),
            if (items == null)
              _failed
                  ? const EmptyState(icon: SolarIconsOutline.wifiRouter, title: 'Couldn’t load your devices', body: 'Check your connection and try again.')
                  : const Padding(
                      padding: EdgeInsets.only(top: 64),
                      child: Center(child: CircularProgressIndicator(color: V.pink)),
                    )
            else
              GroupCard(children: [for (final d in items) _row(d)]),
            if (others > 0)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: GhostButton(
                  label: _busy == 'others' ? 'Signing out…' : 'Sign out of all other devices',
                  icon: SolarIconsOutline.logout_2,
                  height: 46,
                  expand: true,
                  onTap: _busy == null ? () => _endOthers(others) : null,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(DeviceSession d) {
    final color = d.isWeb ? V.lavender : V.pinkSoft;
    final kind = switch (d.client) {
      'android' => 'Android app',
      'ios' => 'iPhone app',
      _ => 'Website',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
            child: Icon(d.isWeb ? SolarIconsBold.laptop : SolarIconsBold.smartphone, size: 22, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(child: Text(d.device, maxLines: 2, overflow: TextOverflow.ellipsis, style: VT.title(15))),
                    if (d.current) ...[const SizedBox(width: 8), const Tag('This phone', color: V.ok)],
                  ],
                ),
                Text('$kind · ${d.current ? 'Active now' : 'Active ${Fmt.ago(d.lastActiveAt)}'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: VT.body(12.5, color: V.text2)),
                Text('Signed in ${Fmt.date(d.signedInAt)}', style: VT.body(12, color: V.muted)),
              ],
            ),
          ),
          if (d.current)
            TextButton(onPressed: () => signOutFlow(context), child: Text('Log out', style: VT.label(13, color: V.text2)))
          else
            TextButton(
              onPressed: _busy == null ? () => _end(d) : null,
              child: Text(_busy == d.id ? 'Signing out…' : 'Sign out', style: VT.label(13, color: V.bad, weight: FontWeight.w700)),
            ),
        ],
      ),
    );
  }
}
