import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../providers/social_provider.dart';

/// Me → Safety → Blocked people: who you blocked, and Unblock for each.
class BlockedPeopleScreen extends StatefulWidget {
  const BlockedPeopleScreen({super.key});

  @override
  State<BlockedPeopleScreen> createState() => _BlockedPeopleScreenState();
}

class _BlockedPeopleScreenState extends State<BlockedPeopleScreen> {
  List<BlockedPerson>? _people;
  String? _error;
  final Set<String> _busy = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final people = await context.read<SocialProvider>().blockedPeople();
      if (mounted) setState(() => _people = people);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _unblock(BlockedPerson b) async {
    final name = b.profile.name.isEmpty ? 'this person' : b.profile.name;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Unblock $name?'),
        content: const Text("You can meet again in Match and Discover, and they can send you a friend request. We won't tell them."),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Unblock')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy.add(b.profile.id));
    try {
      await context.read<SocialProvider>().unblock(b.profile.id);
      if (!mounted) return;
      setState(() => _people?.remove(b));
      toast(context, '$name is unblocked');
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    } finally {
      if (mounted) setState(() => _busy.remove(b.profile.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final people = _people;
    return Scaffold(
      appBar: AppBar(
        leading: Center(child: CircleIconButton(icon: SolarIconsOutline.arrowLeft, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
        leadingWidth: 64,
        title: Text('Blocked people', style: VT.title(17, weight: FontWeight.w600)),
      ),
      body: _error != null
          ? EmptyState(icon: SolarIconsBold.cloudCross, title: "Couldn't load ", accent: 'the list', body: _error!, action: GhostButton(label: 'Try again', onTap: _load))
          : people == null
              ? const Center(child: CircularProgressIndicator(color: V.pink))
              : people.isEmpty
                  ? const EmptyState(icon: SolarIconsBold.forbiddenCircle, title: 'Nobody ', accent: 'blocked', body: 'People you block show up here. You can unblock them any time.')
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      children: [
                        Text("They can't match with you, find you in Discover or message you. Unblocking doesn't tell them.", style: VT.body(13, color: V.text2, height: 1.45)),
                        const SizedBox(height: 12),
                        for (final b in people)
                          Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
                            decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(18)),
                            child: Row(children: [
                              VAvatar(url: b.profile.avatarUrl, name: b.profile.name, size: 44),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(b.profile.name.isEmpty ? 'Someone' : b.profile.name, overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600)),
                                  if (b.blockedAt != null) Text('Blocked ${Fmt.ago(b.blockedAt!)}', style: VT.body(12, color: V.text2)),
                                ]),
                              ),
                              _busy.contains(b.profile.id)
                                  ? const Padding(padding: EdgeInsets.all(12), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: V.pink)))
                                  : GhostButton(label: 'Unblock', height: 38, onTap: () => _unblock(b)),
                            ]),
                          ),
                      ],
                    ),
    );
  }
}
