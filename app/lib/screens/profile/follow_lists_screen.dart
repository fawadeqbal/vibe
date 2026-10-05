import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api/api_exception.dart';
import '../../core/theme/vibe_theme.dart';
import '../../core/theme/vibe_widgets.dart';
import '../../core/util/format.dart';
import '../../models/follows.dart';
import '../../providers/follows_provider.dart';
import 'user_profile_screen.dart';

/// Your followers, who you follow, and (private accounts) waiting requests.
/// Only you can see these lists.
class FollowListsScreen extends StatelessWidget {
  const FollowListsScreen({super.key, this.initial = FollowList.followers});
  final FollowList initial;

  static String _label(FollowList t) => switch (t) {
        FollowList.followers => 'Followers',
        FollowList.following => 'Following',
        FollowList.requests => 'Requests',
      };

  @override
  Widget build(BuildContext context) {
    final private = context.select<FollowsProvider, bool>((f) => f.settings.privateAccount);
    final tabs = [FollowList.followers, FollowList.following, if (private) FollowList.requests];
    return DefaultTabController(
      key: ValueKey(tabs.length),
      length: tabs.length,
      initialIndex: tabs.contains(initial) ? tabs.indexOf(initial) : 0,
      child: Scaffold(
        appBar: AppBar(
          leading: Center(child: CircleIconButton(icon: Icons.arrow_back_rounded, tooltip: 'Back', onTap: () => Navigator.of(context).maybePop())),
          leadingWidth: 64,
          title: Text('Followers', style: VT.title(17, weight: FontWeight.w600)),
          bottom: TabBar(
            indicatorColor: V.pink,
            labelColor: V.text,
            unselectedLabelColor: V.muted,
            dividerColor: V.lineSoft,
            tabs: [for (final t in tabs) Tab(text: _label(t))],
          ),
        ),
        body: TabBarView(children: [for (final t in tabs) _FollowListTab(which: t)]),
      ),
    );
  }
}

class _FollowListTab extends StatefulWidget {
  const _FollowListTab({required this.which});
  final FollowList which;

  @override
  State<_FollowListTab> createState() => _FollowListTabState();
}

class _FollowListTabState extends State<_FollowListTab> with AutomaticKeepAliveClientMixin {
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
              icon: const Icon(Icons.more_horiz_rounded, color: V.muted),
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
        FollowList.followers => const EmptyState(icon: Icons.group_outlined, title: 'No followers yet', body: 'People you meet can follow you from your profile.'),
        FollowList.following => const EmptyState(icon: Icons.person_search_rounded, title: "You don't follow anyone", body: "Tap Follow on someone's profile after a match."),
        FollowList.requests => const EmptyState(icon: Icons.inbox_outlined, title: 'No requests', body: 'While your account is private, new followers wait here.'),
      };
    }
    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.extentAfter < 400) _more();
        return false;
      },
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 8, 12, 32),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, color: V.lineSoft),
        itemBuilder: (context, i) {
          final e = _items[i];
          return InkWell(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => UserProfileScreen(userId: e.profile.id))),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  VAvatar(url: e.profile.avatarUrl, name: e.profile.name, size: 44),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${e.profile.name}, ${e.profile.age} ${e.profile.country.flag}', overflow: TextOverflow.ellipsis, style: VT.title(15, weight: FontWeight.w600)),
                        const SizedBox(height: 1),
                        Text(Fmt.ago(e.since), style: VT.body(12, color: V.text2)),
                      ],
                    ),
                  ),
                  _trailing(e),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
