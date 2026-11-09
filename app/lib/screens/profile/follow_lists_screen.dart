import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:solar_icons/solar_icons.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import 'user_profile_screen.dart';

/// Your followers, who you follow, and (private accounts) waiting requests.
/// Only you can see these lists.
class FollowListsScreen extends StatefulWidget {
  const FollowListsScreen({super.key, this.initial = FollowList.followers});
  final FollowList initial;

  static String _label(FollowList t) => switch (t) {
        FollowList.followers => 'Followers',
        FollowList.following => 'Following',
        FollowList.requests => 'Requests',
      };

  @override
  State<FollowListsScreen> createState() => _FollowListsScreenState();
}

class _FollowListsScreenState extends State<FollowListsScreen> {
  late FollowList _tab = widget.initial;

  @override
  Widget build(BuildContext context) {
    final settings = context.select<FollowsProvider, FollowSettings>((f) => f.settings);
    final tabs = [FollowList.followers, FollowList.following, if (settings.privateAccount) FollowList.requests];
    final shown = tabs.contains(_tab) ? _tab : FollowList.followers;
    int? count(FollowList t) => switch (t) { FollowList.followers => settings.followers, FollowList.following => settings.following, FollowList.requests => null };
    return Scaffold(
      appBar: vibeAppBar(context, 'Followers'),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: PillTabs<FollowList>(
              value: shown,
              onChanged: (v) => setState(() => _tab = v),
              tabs: [for (final t in tabs) (t, (count(t) ?? 0) > 0 ? '${FollowListsScreen._label(t)} · ${Fmt.compact(count(t)!)}' : FollowListsScreen._label(t))],
            ),
          ),
          Expanded(child: _FollowListTab(key: ValueKey(shown), which: shown)),
        ],
      ),
    );
  }
}

class _FollowListTab extends StatefulWidget {
  const _FollowListTab({super.key, required this.which});
  final FollowList which;

  @override
  State<_FollowListTab> createState() => _FollowListTabState();
}

class _FollowListTabState extends State<_FollowListTab> with AutomaticKeepAliveClientMixin {
  String _query = '';
  final List<FollowEntry> _items = [];
  final Set<String> _followedBack = {};
  String? _cursor;
  bool _loaded = false;
  bool _fetching = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _more();
  }

  Future<void> _more() async {
    if (_fetching || (_loaded && _cursor == null)) return;
    _fetching = true;
    try {
      final page = await context.read<FollowsProvider>().list(widget.which, cursor: _cursor);
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
        _loaded = true;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loaded = true);
      toast(context, e.message, error: true);
    } finally {
      _fetching = false;
    }
  }

  Future<void> _act(Future<void> Function(FollowsProvider f) action, {VoidCallback? after}) async {
    try {
      await action(context.read<FollowsProvider>());
      if (mounted && after != null) setState(after);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message, error: true);
    }
  }

  Future<void> _unfollow(FollowEntry e) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Unfollow ${e.profile.name}?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Keep', style: TextStyle(color: V.text2))),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Unfollow', style: TextStyle(color: V.bad))),
        ],
      ),
    );
    if (ok == true) await _act((f) => f.unfollow(e.profile.id), after: () => _items.remove(e));
  }

  Widget _trailing(FollowEntry e) {
    final id = e.profile.id;
    return switch (widget.which) {
      FollowList.requests => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(onPressed: () => _act((f) => f.decline(id), after: () => _items.remove(e)), child: const Text('Decline', style: TextStyle(color: V.text2))),
            GradientButton(label: 'Accept', height: 36, expand: false, onTap: () => _act((f) => f.accept(id), after: () => _items.remove(e))),
          ],
        ),
      FollowList.following => GhostButton(label: 'Following', height: 34, onTap: () => _unfollow(e)),
      FollowList.followers => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!e.followsBack && !_followedBack.contains(id)) GhostButton(label: 'Follow back', height: 34, onTap: () => _act((f) async => f.follow(id), after: () => _followedBack.add(id))),
            PopupMenuButton<String>(
              icon: const Icon(SolarIconsBold.menuDots, color: V.muted),
              tooltip: 'More',
              onSelected: (_) => _act((f) => f.removeFollower(id), after: () => _items.remove(e)),
              itemBuilder: (_) => const [PopupMenuItem(value: 'remove', child: Text('Remove follower', style: TextStyle(color: V.bad)))],
            ),
          ],
        ),
    };
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    if (!_loaded) return const Center(child: CircularProgressIndicator(color: V.pink));
    if (_items.isEmpty) {
      return switch (widget.which) {
        FollowList.followers => const EmptyState(icon: SolarIconsOutline.usersGroupRounded, title: 'No followers yet', body: 'People you meet can follow you from your profile.'),
        FollowList.following => const EmptyState(icon: SolarIconsBold.magnifier, title: "You don't follow anyone", body: "Tap Follow on someone's profile after a match."),
        FollowList.requests => const EmptyState(icon: SolarIconsOutline.inbox, title: 'No requests', body: 'While your account is private, new followers wait here.'),
      };
    }
    final q = _query.trim().toLowerCase();
    final items = q.isEmpty ? _items : _items.where((e) => e.profile.name.toLowerCase().contains(q)).toList();
    final verb = switch (widget.which) { FollowList.followers => 'Followed you', FollowList.following => 'You followed', FollowList.requests => 'Asked' };
    final label = FollowListsScreen._label(widget.which).toLowerCase();
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) _more();
        return false;
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
        children: [
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(24), border: Border.all(color: V.line)),
            child: Row(
              children: [
                const Icon(Icons.search_rounded, size: 21, color: V.muted),
                const SizedBox(width: 10),
                Expanded(
                  child: TextField(
                    onChanged: (v) => setState(() => _query = v),
                    style: VT.body(15),
                    cursorColor: V.pink,
                    decoration: InputDecoration(hintText: 'Search $label', hintStyle: VT.body(15, color: V.muted), filled: false, border: InputBorder.none, enabledBorder: InputBorder.none, focusedBorder: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (items.isEmpty)
            Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text('Nobody called “${_query.trim()}”.', style: VT.body(13.5, color: V.muted)))
          else
            Container(
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(color: V.surface, borderRadius: BorderRadius.circular(22), border: Border.all(color: V.line)),
              child: Column(
                children: [
                  for (final (i, e) in items.indexed) ...[
                    if (i > 0) const Divider(height: 1, indent: 74, color: V.lineSoft),
                    InkWell(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: e.profile.id))),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
                        child: Row(
                          children: [
                            VAvatar(url: e.profile.avatarUrl, name: e.profile.name, size: 44),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(e.profile.name, overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600)),
                                  const SizedBox(height: 1),
                                  Text('$verb ${Fmt.ago(e.since)}', style: VT.body(12, color: V.text2)),
                                ],
                              ),
                            ),
                            _trailing(e),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: 12),
          Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: Text('Only you can see these lists.', style: VT.body(12, color: V.muted))),
        ],
      ),
    );
  }
}
